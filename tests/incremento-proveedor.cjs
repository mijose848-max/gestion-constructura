const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.env.GC_TEST_INDEX||path.join(__dirname,'..','index.html'),'utf8');
const elements={},storage=new Map(),alerts=[];
const el=()=>({innerHTML:'',textContent:'',style:{},append(){},prepend(){},appendChild(){},insertAdjacentHTML(){},querySelector(){return el()},querySelectorAll(){return[]},elements:{obra:{},estado:{}},addEventListener(){},scrollIntoView(){},focus(){},remove(){}});
const context={Intl,Date,Math,Number,JSON,String,Map,Set,Array,Object,Blob,URLSearchParams,AbortSignal,console,setTimeout(){},clearTimeout(){},setInterval(){},alert:s=>alerts.push(s),confirm:()=>true,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:k=>elements[k]??=el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),head:el()},window:{scrollTo(){},addEventListener(){}},FormData:class{constructor(f){this.f=f}entries(){return Object.entries(this.f.values)}}};
const ctx=vm.createContext(context),run=s=>vm.runInContext(s,ctx);
run(html.match(/<script>([\s\S]*)<\/script>/)[1]);
run(`db=blank();db.proveedores.push({id:'p',nombre:'Proveedor A'},{id:'q',nombre:'Proveedor B'},{id:'vacio',nombre:'Sin materiales'});db.materiales.push({id:'a',nombre:'Material A',proveedor:'p',compra:100,venta:110,margen:10,unidad:'ud'},{id:'b',nombre:'Material B',proveedor:'p',compra:20,venta:24,margen:20,unidad:'saco'},{id:'c',nombre:'Material C',proveedor:'q',compra:100,venta:120,margen:20},{id:'sin',nombre:'Sin proveedor',proveedor:'',compra:10,venta:12,margen:20});db.obras.push({id:'o',nombre:'Obra',incrementosVenta:{materiales:35,manoObra:40}});db.facturas.push({id:'f',tipo:'emitida',base:100,total:121});db.partidas.push({id:'partida',precio:10,cantidad:2});confirmadoV25=JSON.stringify(db);`);
context.batchForm={elements:{proveedor:{value:'p'},incremento:{value:'25'}}};
const before=run('JSON.stringify(db)');run('previewIncrementoProveedor(batchForm)');assert.equal(run('JSON.stringify(db)'),before,'La vista previa no guarda');
context.confirm=()=>false;run('aplicarIncrementoProveedor({preventDefault(){},target:batchForm})');assert.equal(run('JSON.stringify(db)'),before,'Cancelar no cambia materiales');context.confirm=()=>true;
run("vistaBaseMateriales='proveedor';filtroProveedorMateriales='q';aplicarIncrementoProveedor({preventDefault(){},target:batchForm})");
assert.equal(run("by('materiales','a').venta"),125);assert.equal(run("by('materiales','b').venta"),25);
assert.equal(run("by('materiales','a').margen"),25);assert.equal(run("by('materiales','b').margen"),25);
assert.equal(run("by('materiales','a').compra"),100);assert.equal(run("by('materiales','b').unidad"),'saco');
assert.equal(run("by('materiales','c').venta"),120);assert.equal(run("by('materiales','sin').venta"),12);
assert.equal(run('db.obras[0].incrementosVenta.materiales'),35);assert.equal(run('db.facturas[0].total'),121);assert.equal(run('db.partidas[0].precio'),10);
assert.equal(JSON.parse(storage.get('gc_v25_prueba_tarifas')).materiales[0].venta,125);
assert.equal(run('gcDriveDecode(JSON.parse(gcDriveSnapshot())).data.materiales[1].margen'),25);
const saved=run('JSON.stringify(db)');for(const v of ['','-1','Infinity','abc']){context.batchForm.elements.incremento.value=v;run('aplicarIncrementoProveedor({preventDefault(){},target:batchForm})');assert.equal(run('JSON.stringify(db)'),saved);}
context.batchForm.elements.incremento.value='25';for(const v of ['no','vacio','']){context.batchForm.elements.proveedor.value=v;run('aplicarIncrementoProveedor({preventDefault(){},target:batchForm})');assert.equal(run('JSON.stringify(db)'),saved);}
context.batchForm.elements.proveedor.value='p';run("by('materiales','b').compra=-1");const invalid=run('JSON.stringify(db)');run('aplicarIncrementoProveedor({preventDefault(){},target:batchForm})');assert.equal(run('JSON.stringify(db)'),invalid,'Si un coste es inválido, no se actualiza ninguno');run("by('materiales','b').compra=20");
context.single={elements:Object.fromEntries(Object.entries({nombre:'Material B',unidad:'saco',codigo:'B',compra:20,margen:50,proveedor:'p'}).map(([k,v])=>[k,{value:String(v)}]))};run("editingMaterial='b';guardarMaterial({preventDefault(){},target:single})");
assert.equal(run("by('materiales','b').venta"),30);assert.equal(run("by('materiales','a').venta"),125,'La edición individual sigue independiente');
context.batchForm.elements.incremento.value='0';run('aplicarIncrementoProveedor({preventDefault(){},target:batchForm})');assert.equal(run("by('materiales','b').venta"),20);
const final=run('JSON.stringify(db)');run("localStorage.setItem=()=>{throw Error('Sin espacio')}");context.batchForm.elements.incremento.value='60';assert.throws(()=>run('aplicarIncrementoProveedor({preventDefault(){},target:batchForm})'));assert.equal(run('JSON.stringify(db)'),final,'Revierte todo el lote si falla el guardado');
console.log('OK: actualización por proveedor, cancelación y vista previa, edición individual, filtros, aislamiento, precios de compra intactos, persistencia, validación y reversión completa.');
