let gcOCRPaginasLeidas=[],gcOCRUltimasPosiciones=[];
const gcOCRRedondear=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
function gcOCRImportes(linea){
 const encontrados=[];const re=/-?(?:[0-9OoIl|]{1,3}(?:[., ][0-9OoIl|]{3})+|[0-9OoIl|]+)[.,][0-9OoIl|]{2}(?![0-9OoIl|])/g;
 for(const m of String(linea).matchAll(re)){if(!/\d/.test(m[0])||/^\s*%/.test(linea.slice(m.index+m[0].length)))continue;let s=m[0].replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');const n=Number(s);if(Number.isFinite(n))encontrados.push(n);}
 return encontrados;
}
function gcOCRTotales(texto,retencion=0){
 const lineas=String(texto||'').split(/\n/).map(l=>l.trim()).filter(Boolean),base=[],iva=[],total=[];
 for(let i=0;i<lineas.length;i++){const l=lineas[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'');const valores=gcOCRImportes(lineas[i]);const siguientes=!valores.length&&lineas[i+1]?gcOCRImportes(lineas[i+1]):[];const ultimo=(valores.length?valores:siguientes).at(-1);if(ultimo===undefined)continue;
 if(/\bbase\s*(?:imponib[l1i]e|neta|total)\b/i.test(l))base.push(ultimo);
 if(/(?:cuota|importe)\s*(?:de\s*)?i\.?v\.?a|^i\.?v\.?a\.?(?:\s|:)/i.test(l))iva.push(ultimo);
 if(/total\s*(?:factura|a\s*pagar|documento|euros)|importe\s*total|^total\s*[:€]?/i.test(l))total.push(ultimo);
 }
 const validos=[];
 for(const b of base.slice(-3))for(const q of iva.slice(-3))for(const t of total.slice(-3)){if(Math.abs(gcOCRRedondear(b+q-gcOCRRedondear(b*retencion/100))-t)>0.02)continue;const tipo=[0,4,10,21].find(v=>Math.abs(gcOCRRedondear(b*v/100)-q)<0.02);if(tipo!==undefined)validos.push({base:b,iva:q,total:t,vat:tipo});}
 const unicos=[...new Map(validos.map(v=>[JSON.stringify(v),v])).values()];return unicos.length===1?unicos[0]:null;
}
function gcOCRPalabras(data){if(Array.isArray(data.words)&&data.words.length)return data.words;const palabras=[];for(const bloque of data.blocks||[])for(const parrafo of bloque.paragraphs||[])for(const linea of parrafo.lines||[])palabras.push(...(linea.words||[]));return palabras;}
function gcOCRFilas(data){
 const filas=[];for(const p of gcOCRPalabras(data)){if(!p.text?.trim()||!p.bbox)continue;const b=p.bbox,centro=(b.y0+b.y1)/2,alto=Math.max(1,b.y1-b.y0);let fila=filas.find(f=>Math.abs(f.y-centro)<Math.max(3,Math.min(f.alto,alto)*0.45));if(!fila){fila={y:centro,alto,partes:[]};filas.push(fila);}fila.partes.push(p);}
 filas.sort((a,b)=>a.y-b.y);filas.forEach(f=>f.partes.sort((a,b)=>a.bbox.x0-b.bbox.x0));return filas;
}
function gcOCRTexto(data){const filas=gcOCRFilas(data);if(!filas.length)return data.text||'';return filas.map(f=>f.partes.map((p,i)=>{const anterior=f.partes[i-1],gap=anterior?p.bbox.x0-anterior.bbox.x1:0;return (i?' '.repeat(Math.max(1,Math.min(12,Math.round(gap/Math.max(3,f.alto*0.32))))):'')+p.text;}).join('')).join('\n');}
function gcOCRPuntuacion(data){const text=gcOCRTexto(data),importes=gcOCRImportes(text).length,letras=(text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[]).length;return Number(data.confidence||0)+Math.min(importes,12)*0.4+Math.min(letras,100)*0.02+(gcOCRTotales(text)?14:0)-(text.match(/[�]/g)||[]).length*3;}
function gcOCRContraste(canvas){
 const copia=document.createElement('canvas');copia.width=canvas.width;copia.height=canvas.height;const ctx=copia.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);const imagen=ctx.getImageData(0,0,copia.width,copia.height),datos=imagen.data,hist=new Uint32Array(256);for(let i=0;i<datos.length;i+=4)hist[Math.round(datos[i]*.299+datos[i+1]*.587+datos[i+2]*.114)]++;
 const n=datos.length/4;let acumulado=0,bajo=0,alto=255;for(let k=0;k<256;k++){acumulado+=hist[k];if(acumulado>=n*.005){bajo=k;break;}}acumulado=0;for(let k=255;k>=0;k--){acumulado+=hist[k];if(acumulado>=n*.005){alto=k;break;}}
 const rango=Math.max(40,alto-bajo);for(let i=0;i<datos.length;i+=4){const gris=datos[i]*.299+datos[i+1]*.587+datos[i+2]*.114,v=Math.max(0,Math.min(255,(gris-bajo)*255/rango));datos[i]=datos[i+1]=datos[i+2]=v;datos[i+3]=255;}ctx.putImageData(imagen,0,0);return copia;
}
async function gcReconocerPaginaMejorada(page,status){
 gcOCRUltimasPosiciones=[];if(!window.Tesseract)window.Tesseract=await parent.gcCargarOCR();if(!ocrWorker)ocrWorker=await window.Tesseract.createWorker('spa+eng',1,parent.gcOpcionesOCR());
 const base=page.getViewport({scale:1}),escala=Math.min(300/72,Math.sqrt(12000000/(base.width*base.height)),5000/Math.max(base.width,base.height)),viewport=page.getViewport({scale:escala}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);let contraste;
 try{status.textContent='Escaneo: leyendo a mayor resolución y reconociendo columnas…';await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
 await ocrWorker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',user_defined_dpi:'300'});
 const primera=await ocrWorker.recognize(canvas,{rotateAuto:true},{text:true,blocks:true});let mejor=primera.data,metodo='Columnas';
 if(Number(mejor.confidence||0)<85||!gcOCRTotales(gcOCRTexto(mejor))){status.textContent='Escaneo: segunda pasada para mejorar contraste y texto…';contraste=gcOCRContraste(canvas);await ocrWorker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});const segunda=await ocrWorker.recognize(contraste,{rotateAuto:true},{text:true,blocks:true});if(gcOCRPuntuacion(segunda.data)>gcOCRPuntuacion(mejor)){mejor=segunda.data;metodo='Contraste mejorado';}}
 const texto=gcOCRTexto(mejor),pagina=gcOCRPaginasLeidas.length,offset=(10-pagina)*2000;
 for(const fila of gcOCRFilas(mejor)){let grupo=[];const emitir=()=>{if(!grupo.length)return;const a=grupo[0].bbox,z=grupo.at(-1).bbox;gcOCRUltimasPosiciones.push({str:grupo.map(p=>p.text).join(' '),transform:[1,0,0,1,a.x0/escala,(viewport.height-a.y0)/escala+offset],width:(z.x1-a.x0)/escala});grupo=[];};for(const p of fila.partes){if(grupo.length&&p.bbox.x0-grupo.at(-1).bbox.x1>fila.alto*.9)emitir();grupo.push(p);}emitir();}
 gcOCRPaginasLeidas.push({texto,confianza:Number(mejor.confidence||0),metodo});return texto;
 }finally{canvas.width=canvas.height=0;if(contraste)contraste.width=contraste.height=0;}
}
function gcRevisarDatosOCR(texto,data){
 const totales=gcOCRTotales(texto,Number(data.withholding||0)),out={...data};if(totales){out.base=totales.base;out.vat=totales.vat;out.hasTotal=true;out.totalValue=totales.total;}
 const fecha=String(texto).match(/(?:^|\n)\s*fecha(?:\s+(?:de\s+)?(?:factura|emisi[oó]n))?\s*[:.-]?\s*([0-9OoIl|]{1,2}[\/.-][0-9OoIl|]{1,2}[\/.-][0-9OoIl|]{2,4})/i);if(fecha){const partes=fecha[1].replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').split(/[\/.-]/),d=Number(partes[0]),m=Number(partes[1]),y=Number(partes[2])+(partes[2].length===2?2000:0),comprobar=new Date(Date.UTC(y,m-1,d));if(comprobar.getUTCFullYear()===y&&comprobar.getUTCMonth()===m-1&&comprobar.getUTCDate()===d)out.date=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
 return out;
}
function gcMostrarRevisionOCR(texto,data){
 let panel=document.getElementById('gcOCRRevision');if(!panel){panel=document.createElement('details');panel.id='gcOCRRevision';panel.className='wide panel';const formulario=document.getElementById('entryForm');if(!formulario)return;formulario.appendChild(panel);}
 const dudas=gcOCRPaginasLeidas.some(p=>p.confianza<70),cuadra=data.hasTotal&&data.base!==null&&Math.abs(gcOCRRedondear(Number(data.base)*(1+Number(data.vat)/100)-gcOCRRedondear(Number(data.base)*Number(data.withholding||0)/100))-Number(data.totalValue))<.03;
 panel.innerHTML='<summary>'+(dudas?'Lectura OCR con dudas: revisar texto e importes':'Texto reconocido del escaneo')+'</summary><p class="muted">'+(cuadra?'La base, el IVA y el total detectados cuadran. Comprueba que coincidan con el documento.':'Comprueba la base, el IVA y el total con el documento antes de guardar.')+'</p><textarea id="gcOCRTexto" readonly rows="12" style="width:100%"></textarea><button type="button" class="btn" id="gcOCRReleer">Volver a leer el escaneo</button>';
 panel.querySelector('textarea').value=texto;panel.open=dudas||!cuadra;panel.hidden=false;panel.querySelector('button').onclick=()=>{if(!pdfRunning||!pdfQueue[pdfIndex])return;pdfQueue[pdfIndex].gcForceOCR=true;pdfQueue[pdfIndex].gcScanPages=10;nextPdf();};
}
async function gcScanGirar(indice){
 if(gcScanOcupado)return;gcScanBloquear(true);try{const pagina=gcScanPaginas[indice];if(!pagina)return;const imagen=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('No se pudo girar la página.'));i.src=pagina.preview;});const c=document.createElement('canvas');c.width=pagina.height;c.height=pagina.width;const ctx=c.getContext('2d');ctx.translate(c.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(imagen,0,0);const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('No se pudo girar la página.')),'image/jpeg',.96));URL.revokeObjectURL(pagina.preview);pagina.preview=URL.createObjectURL(blob);pagina.jpeg=new Uint8Array(await blob.arrayBuffer());pagina.width=c.width;pagina.height=c.height;c.width=c.height=0;gcScanDibujar();gcScanEstado('Página girada. Comprueba que el texto se vea derecho antes de leer.');}catch(e){gcScanEstado(e.message);}finally{gcScanBloquear(false);}
}
