const vm=require('vm'),fs=require('fs'),assert=require('assert');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const code=html.match(/<script>([\s\S]*)<\/script>/)[1];const elements={},events={},storage=new Map(),requests=[],alerts=[],timers=[];
const el=()=>({innerHTML:'',textContent:'',value:'0',style:{},append(){},prepend(){},appendChild(){},setAttribute(){},insertAdjacentHTML(){},querySelector(){return el()},querySelectorAll(){return[]},elements:{obra:{},estado:{}},addEventListener(){},scrollIntoView(){},remove(){}});
let files=[],media={},nextId=1,fetchHook=null,failStatus=0;
function addRemote(data,parents=[],name='gestion-constructora-v25-datos.json'){const file={id:'remote_'+nextId++,name,createdTime:new Date(1700000000000+nextId*1000).toISOString(),appProperties:Object.fromEntries(parents.map((p,i)=>['parent'+i,p]))};files.push(file);media[file.id]=structuredClone(data);return file;}
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(data)});
async function fetchMock(url,options={}){
 requests.push({url,method:options.method||'GET'});if(fetchHook)await fetchHook(url,options);if(failStatus)return response({error:{message:'Simulated failure'}},failStatus);
 const u=new URL(url);
 if(u.pathname==='/drive/v3/files'){const q=u.searchParams.get('q');const name=q.match(/name = '([^']+)'/)[1];return response({files:files.filter(f=>f.name===name)});}
 if(u.pathname.startsWith('/drive/v3/files/')){const id=decodeURIComponent(u.pathname.split('/').pop());return response(media[id]);}
 if(u.pathname==='/upload/drive/v3/files'){
  assert.equal(options.method,'POST','Remote files must never be overwritten');
  const chunks=options.body.split(/\r\n--[^\r]+/);const parse=part=>JSON.parse(part.slice(part.indexOf('\r\n\r\n')+4).trim());
  const metadata=parse(chunks[0]),body=parse(chunks[1]);const file=addRemote(body,[],metadata.name);file.appProperties=metadata.appProperties;return response(file);
 }
 throw Error('Unexpected URL '+url);
}
const context={Intl,Date,Math,Number,JSON,String,Map,Set,Array,Object,Blob,URLSearchParams,AbortSignal,console,fetch:fetchMock,setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout(){},setInterval(){},alert:s=>alerts.push(s),confirm:()=>true,location:{protocol:'https:',hostname:'mijose848-max.github.io',origin:'https://mijose848-max.github.io'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:k=>elements[k]??=el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),head:el()},window:{scrollTo(){},addEventListener:(k,f)=>events[k]=f},FormData:class{constructor(f){this.f=f}entries(){return Object.entries(this.f.values)}}};
const ctx=vm.createContext(context);vm.runInContext(code,ctx);const run=s=>vm.runInContext(s,ctx);const results=[];const ok=(v,s)=>{assert(v,s);results.push(s)};
const authorize=()=>run("gcDriveToken='test';gcDriveUntil=Date.now()+3600000");
(async()=>{
 ok(requests.length===0,'No Google requests before user connection');
 run("db=blank();confirmadoV25=JSON.stringify(db);db.obras.push({id:'local',nombre:'Obra local'});save()");ok(run('gcDriveDirty'),'Local save marks pending');ok(storage.has('gc_v25_prueba_tarifas'),'Local save preserved');
 authorize();await run('gcDriveInitialize()');ok(!run('gcDriveReady')&&files.length===0,'First connection requires choosing data');
 await run("gcDriveChoose('local')");ok(files.length===1&&run('gcDriveReady')&&!run('gcDriveDirty'),'Initial full copy created');const first=files[0];ok(media[first.id].data.obras[0].nombre==='Obra local','Snapshot contains actual database');
 run("db.obras[0].nombre='Cambio local';save()");await run('gcDriveSync()');ok(files.length===2,'Automatic sync creates immutable revision');ok(media[first.id].data.obras[0].nombre==='Obra local','Previous remote copy remains unchanged');ok(run('gcDriveHeads(gcDriveFiles).length')===1,'Parent links leave one active revision');
 const parent=files.at(-1),remoteData=structuredClone(media[parent.id]);remoteData.data.obras[0].nombre='Cambio otro equipo';addRemote(remoteData,[parent.id]);await run('gcDriveSync()');ok(run("db.obras[0].nombre")==='Cambio otro equipo','Remote changes load when local data is clean');
 run("db.obras[0].nombre='Edicion sin sincronizar';save()");const current=files.at(-1);addRemote(remoteData,[current.id]);await run('gcDriveSync()');ok(!run('gcDriveReady')&&run("db.obras[0].nombre")==='Edicion sin sincronizar','Conflict pauses sync and preserves local changes');
 await run("gcDriveChoose('local')");ok(run('gcDriveReady'),'Explicit local choice resolves conflict');
 // Simultaneous writes branching from the same ancestor retain both data sets.
 const root=files.at(-1);addRemote(remoteData,[root.id]);addRemote({...remoteData,savedAt:'other'},[root.id]);await run('gcDriveSync()');ok(!run('gcDriveReady')&&run('gcDriveHeads(gcDriveFiles).length')===2,'Simultaneous writers produce recoverable branches');await run("gcDriveChoose('local')");ok(run('gcDriveReady')&&await run('gcDriveList().then(gcDriveHeads).then(x=>x.length)')===1,'Choosing a copy joins branches');
 // Changes made while an upload is in flight must remain dirty.
 run("db.obras[0].nombre='Snapshot en vuelo';save()");let changed=false;fetchHook=async(url)=>{if(url.includes('/upload/')&&!changed){changed=true;run("db.obras[0].nombre='Cambio durante subida';save()")}};await run('gcDriveSync()');fetchHook=null;ok(run('gcDriveDirty'),'Edits during upload remain pending');await run('gcDriveSync()');ok(!run('gcDriveDirty'),'Pending edit uploads next');
 // Offline or rejected API must never discard local changes.
 run("db.obras[0].nombre='Sin red';save()");failStatus=503;await run('gcDriveSync()');failStatus=0;ok(run('gcDriveDirty')&&run("db.obras[0].nombre")==='Sin red','Network failure preserves pending local data');await run('gcDriveSync()');
 // Expired auth and disconnect never persist tokens or remove local data.
 run('gcDriveUntil=0');const before=requests.length;await run('gcDriveSync()');ok(requests.length===before,'Expired token blocks requests');authorize();run('gcDriveDisconnect()');ok(!run('gcDriveToken')&&!run('gcDriveReady')&&run('db.obras.length')===1,'Disconnect clears session and keeps local database');ok(![...storage.values()].some(v=>v==='test'),'Access token never persisted');
 // Old V23 data is imported into a new V25 revision, never overwritten.
 files=[];media={};const oldDb=run('blank()');oldDb.facturas.push({id:'old',numero:'Old',tipo:'emitida',base:100,total:121,estado:'pagada'});const old=addRemote({format:'gestion-constructora',data:oldDb},[],'gestion-constructora-datos.json');authorize();await run('gcDriveInitialize()');await run("gcDriveChoose('remote')");ok(run("db.facturas[0].saldoAnteriorV25")===121,'V23 paid status migrated without fictitious cash');ok(files.some(f=>f.id===old.id)&&files.length===2,'V23 remote file preserved alongside new V25 copy');
 // Restoring a historical copy creates a fresh active head.
 run("db.obras.push({id:'new',nombre:'Nueva'});save()");await run('gcDriveSync()');const count=files.length;await run('gcDriveHistory()');elements.gcDriveSelected.value='1';await run("gcDriveChoose('remote')");ok(files.length===count+1&&run('db.obras.length')===0,'Drive history restoration keeps later snapshots');
 // A malformed remote copy cannot replace the database.
 const currentHead=files.at(-1);addRemote({format:'gestion-constructora',data:{facturas:[{id:'bad',tipo:'emitida',base:-1,total:1}]}},[currentHead.id]);const beforeBad=run('JSON.stringify(db)');await run('gcDriveSync()');ok(run('JSON.stringify(db)')===beforeBad,'Invalid remote data rejected');

 // Initial account authorization checks scope and resets the previous account state.
 let oauthConfig,requested;context.window.google={accounts:{oauth2:{initTokenClient:c=>{oauthConfig=c;return{requestAccessToken:r=>requested=r}},hasGrantedAllScopes:r=>r.scope==='https://www.googleapis.com/auth/drive.appdata'}}};
 run('gcDriveConnect()');ok(!run('gcDriveToken')&&!run('gcDriveReady')&&requested.prompt==='select_account','Reconnect resets account and requires account selection');
 await oauthConfig.callback({access_token:'ungranted',expires_in:3600,scope:'other'});ok(!run('gcDriveToken'),'Missing scope cannot enable sync');
 await oauthConfig.callback({access_token:'authorized',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'});ok(run('gcDriveToken')==='authorized'&&!run('gcDriveReady'),'Granted scope opens selection before syncing');
 run('gcDriveDisconnect()');const noNetwork=requests.length;context.location.protocol='file:';context.location.hostname='';run('gcDriveConnect()');ok(requests.length===noNetwork&&!run('gcDriveToken'),'Downloaded HTML refuses OAuth on file URL');
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
