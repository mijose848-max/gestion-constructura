// Puente de almacenamiento local: confirma la escritura en disco antes de continuar.
(()=>{
 const token=window.GC_DESKTOP_CONFIG?.token;
 if(!token)throw Error('Abre el programa con GestionConstructora.exe.');
 let current;
 function request(method,path,body){const xhr=new XMLHttpRequest();xhr.open(method,path,false);xhr.setRequestHeader('X-GC-Token',token);if(body!==undefined)xhr.setRequestHeader('Content-Type','application/json');xhr.send(body===undefined?null:JSON.stringify(body));let data;try{data=JSON.parse(xhr.responseText)}catch{throw Error('No se pudo leer la respuesta del programa local.');}if(xhr.status!==200)throw Error(data.error||'No se pudieron guardar los datos locales.');return data;}
 current=request('GET','/api/storage');
 window.desktopStorage={
  getItem(key){return Object.prototype.hasOwnProperty.call(current.values,key)?current.values[key]:null;},
  setItem(key,value){const result=request('POST','/api/storage',{expectedRevision:current.revision,key,value:String(value)});current.revision=result.revision;current.values[key]=String(value);window.GC_DESKTOP_BACKUP_WARNING=result.backupWarning||'';},
  removeItem(key){const result=request('POST','/api/storage',{expectedRevision:current.revision,key,remove:true});current.revision=result.revision;delete current.values[key];},
  get revision(){return current.revision;},get backupFolder(){return current.backupFolder;},
  applySnapshot(snapshot){current=snapshot;},request,
  async command(path){const r=await fetch(path,{method:'POST',headers:{'X-GC-Token':token,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:current.revision})});const result=await r.json();if(!r.ok)throw Error(result.error||'No se pudo completar la operación.');return result;}
 };
})();
