let gcScanPaginas=[],gcScanOcupado=false;
function gcPDFEscaneos(paginas){
 if(!paginas.length||paginas.length>10)throw Error('Añade entre 1 y 10 páginas por factura.');
 const encoder=new TextEncoder(),trozos=[],offsets=[0];let largo=0;
 const add=d=>{const bytes=typeof d==='string'?encoder.encode(d):d;trozos.push(bytes);largo+=bytes.length;};
 const objeto=(n,partes)=>{offsets[n]=largo;add(n+' 0 obj\n');partes.forEach(add);add('\nendobj\n');};
 add('%PDF-1.4\n%GCscan\n');objeto(1,['<< /Type /Catalog /Pages 2 0 R >>']);objeto(2,['<< /Type /Pages /Count '+paginas.length+' /Kids ['+paginas.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>']);
 paginas.forEach((p,i)=>{if(!p.jpeg?.length||!p.width||!p.height)throw Error('Una página escaneada no es válida.');const base=3+i*3,horizontal=p.width>p.height,w=horizontal?842:595,h=horizontal?595:842,ratio=Math.min((w-36)/p.width,(h-36)/p.height),iw=p.width*ratio,ih=p.height*ratio;const pintar='q '+iw.toFixed(3)+' 0 0 '+ih.toFixed(3)+' '+((w-iw)/2).toFixed(3)+' '+((h-ih)/2).toFixed(3)+' cm /Im0 Do Q\n';objeto(base,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /Im0 '+(base+1)+' 0 R >> >> /Contents '+(base+2)+' 0 R >>']);objeto(base+1,['<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.jpeg.length+' >>\nstream\n',p.jpeg,'\nendstream']);objeto(base+2,['<< /Length '+encoder.encode(pintar).length+' >>\nstream\n'+pintar+'endstream']);});
 const xref=largo,count=3+paginas.length*3;add('xref\n0 '+count+'\n0000000000 65535 f \n');for(let n=1;n<count;n++)add(String(offsets[n]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');return new Blob(trozos,{type:'application/pdf'});
}
function gcScanEstado(texto){document.getElementById('gcScanStatus').textContent=texto;}
function gcScanDibujar(){const lista=document.getElementById('gcScanPages');if(!lista)return;lista.innerHTML=gcScanPaginas.map((p,i)=>'<div class="card"><img style="width:100%;height:140px;object-fit:contain" src="'+p.preview+'" alt="Página escaneada '+(i+1)+'"><p>Página '+(i+1)+' · '+safe(p.name)+'</p><button type="button" class="btn" data-scan-rotate="'+i+'">Girar 90°</button><button type="button" class="btn danger" data-scan-remove="'+i+'">Quitar página</button></div>').join('');lista.querySelectorAll('[data-scan-remove]').forEach(b=>b.onclick=()=>{if(gcScanOcupado)return;const n=Number(b.dataset.scanRemove);URL.revokeObjectURL(gcScanPaginas[n].preview);gcScanPaginas.splice(n,1);gcScanDibujar();});lista.querySelectorAll('[data-scan-rotate]').forEach(b=>b.onclick=()=>gcScanGirar(Number(b.dataset.scanRotate)));document.getElementById('gcScanRead').disabled=gcScanOcupado||!gcScanPaginas.length;}
function gcScanBloquear(estado){gcScanOcupado=estado;for(const id of ['gcScanCapture','gcScanImages','gcScanPdf','gcScanRead','gcScanClear']){const el=document.getElementById(id);if(el)el.disabled=estado;}gcScanDibujar();}
async function gcScanAgregar(file){
 if(gcScanPaginas.length>=10)throw Error('Puedes preparar hasta 10 páginas por factura. Lee o vacía las páginas actuales antes de añadir más.');
 if(file.size>25*1024*1024)throw Error('La imagen supera 25 MB. Escanea a 300 ppp o guarda un PDF.');
 const url=URL.createObjectURL(file);let img;
 try{img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('No se pudo abrir la imagen. Utiliza PNG, JPG, BMP o un PDF.'));image.src=url;});if(img.naturalWidth*img.naturalHeight>40000000)throw Error('La imagen tiene una resolución demasiado alta. Prueba con 300 ppp.');
 const ratio=Math.min(1,3508/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo preparar la imagen.')),'image/jpeg',0.98));const width=canvas.width,height=canvas.height;canvas.width=canvas.height=0;gcScanPaginas.push({name:file.name,width,height,jpeg:new Uint8Array(await blob.arrayBuffer()),preview:URL.createObjectURL(blob)});gcScanDibujar();
 }finally{URL.revokeObjectURL(url);}
}
async function gcScanCapturar(){
 if(gcScanOcupado)return;gcScanBloquear(true);gcScanEstado('Selecciona el escáner en la ventana de Windows y realiza la captura…');
 try{const result=await parent.gcCapturarDesdeEscaner();if(result.cancelled){gcScanEstado('Captura cancelada. Puedes volver a escanear.');return;}const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));await gcScanAgregar(new File([bytes],result.name,{type:result.mimeType}));gcScanEstado('Página capturada. Puedes añadir otra página o pulsar Leer escaneos con OCR.');}catch(e){gcScanEstado(e.message+' También puedes cargar un PDF o imágenes generados por tu escáner.');}finally{gcScanBloquear(false);}
}
function gcScanIniciarCola(files){
 if(pdfRunning&&!confirm('¿Terminar la lectura anterior e iniciar estos escaneos? Las facturas ya guardadas se conservarán.'))return false;
 $('pdfType').value=document.getElementById('gcScanType').value;pdfReadyToAttach=null;pdfQueue=files;pdfIndex=0;pdfImported=0;pdfDuplicates=0;pdfRunning=true;tab('pdfs');nextPdf();return true;
}
async function gcScanLeer(){
 if(gcScanOcupado||!gcScanPaginas.length)return;gcScanBloquear(true);gcScanEstado('Preparando el documento para leer con OCR…');
 try{const grupos=document.getElementById('gcScanJoin').checked?[gcScanPaginas]:gcScanPaginas.map(p=>[p]),files=grupos.map((grupo,i)=>{const blob=gcPDFEscaneos(grupo);if(blob.size>15*1024*1024)throw Error('El PDF supera 15 MB. Reduce el número de páginas o la resolución.');const file=new File([blob],'Escaneo-'+Date.now()+'-'+(i+1)+'.pdf',{type:'application/pdf'});file.gcScanPages=grupo.length;file.gcForceOCR=true;return file;});if(gcScanIniciarCola(files)){gcScanPaginas.forEach(p=>URL.revokeObjectURL(p.preview));gcScanPaginas=[];gcScanDibujar();gcScanEstado('Escaneos preparados. Revisa y guarda cada factura en el formulario.');}}catch(e){gcScanEstado(e.message);}finally{gcScanBloquear(false);}
}
setTimeout(()=>{
 const capture=document.getElementById('gcScanCapture');if(!capture)return;
 capture.onclick=gcScanCapturar;document.getElementById('gcScanRead').onclick=gcScanLeer;
 document.getElementById('gcScanClear').onclick=()=>{if(gcScanOcupado)return;gcScanPaginas.forEach(p=>URL.revokeObjectURL(p.preview));gcScanPaginas=[];gcScanDibujar();gcScanEstado('Páginas eliminadas de la preparación.');};
 document.getElementById('gcScanImages').onchange=async event=>{const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length||gcScanOcupado)return;gcScanBloquear(true);try{for(const file of files)await gcScanAgregar(file);gcScanEstado('Imágenes preparadas. Revisa el orden de las páginas y pulsa Leer escaneos con OCR.');}catch(e){gcScanEstado(e.message);}finally{gcScanBloquear(false);}};
 document.getElementById('gcScanPdf').onchange=event=>{const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length||gcScanOcupado)return;for(const file of files){file.gcForceOCR=true;file.gcScanPages=10;}gcScanIniciarCola(files);};gcScanDibujar();
},0);
