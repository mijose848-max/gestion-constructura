const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.env.GC_TEST_INDEX||path.join(__dirname,'..','index.html'),'utf8');
const elements={},storage=new Map(),alerts=[];
const el=()=>({innerHTML:'',textContent:'',style:{},append(){},prepend(){},appendChild(){},insertAdjacentHTML(){},querySelector(){return el()},querySelectorAll(){return[]},elements:{obra:{},estado:{}},addEventListener(){},scrollIntoView(){},focus(){},remove(){}});
const context={Intl,Date,Math,Number,JSON,String,Map,Set,Array,Object,Blob,URLSearchParams,AbortSignal,console,setTimeout(){},clearTimeout(){},setInterval(){},alert:s=>alerts.push(s),confirm:()=>true,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:k=>elements[k]??=el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),head:el()},window:{scrollTo(){},addEventListener(){}},FormData:class{constructor(f){this.f=f}entries(){return Object.entries(this.f.values)}}};
const ctx=vm.createContext(context),run=s=>vm.runInContext(s,ctx);
run(html.match(/<script>([\s\S]*)<\/script>/)[1]);
run(`db=blank();db.obras.push({id:'a',nombre:'A',contrato:300,desgloseEconomico:[{id:'l',descripcion:'Manual',unidad:'ud',cantidad:1,precioCoste:20,incremento:10}]},{id:'b',nombre:'B',incrementosVenta:{materiales:10,manoObra:20}});db.materiales.push({id:'mat',nombre:'Material',unidad:'saco',compra:5,venta:6});db.materialesPartes.push({id:'mp',obra:'a',fecha:'2026-10-31',cantidad:3,precio:10});db.albaranes.push({id:'al',obra:'a',cantidad:3,precio:10,descuento:0});db.gastos.push({id:'g',obra:'a',tipo:'Materiales',importe:40},{id:'otros',obra:'a',tipo:'Otros',importe:50},{id:'otra',obra:'b',tipo:'Materiales',importe:999});db.horas.push({id:'h',obra:'a',cantidad:1,coste:20});db.facturas.push({id:'f',tipo:'emitida',base:100,total:121});confirmadoV25=JSON.stringify(db);obraDesgloseSeleccionada='a';`);
const snapshot=run('JSON.stringify(db)');context.testForm={elements:{materiales:{value:'25'},manoObra:{value:'35'}}};
run("previewIncrementosObra(testForm,'a')");assert.equal(run('JSON.stringify(db)'),snapshot,'Previsualizar no modifica datos');
run("guardarIncrementosObra({preventDefault(){},target:testForm},'a')");
const result=JSON.parse(run("JSON.stringify(ventaConIncrementosObra(by('obras','a')))"));
assert.deepEqual(result.materiales,{coste:100,incremento:25,venta:125,beneficio:25});
assert.deepEqual(result.manoObra,{coste:20,incremento:35,venta:27,beneficio:7});
assert.deepEqual(result.total,{coste:120,venta:152,beneficio:32});
assert.equal(run("by('obras','a').contrato"),300);assert.equal(run('db.facturas[0].total'),121);assert.equal(run('db.materiales[0].venta'),6);assert.equal(run("by('obras','a').desgloseEconomico[0].incremento"),10);
assert.equal(run("by('obras','b').incrementosVenta.materiales"),10,'Independencia entre obras');
assert.equal(JSON.parse(storage.get('gc_v25_prueba_tarifas')).obras[0].incrementosVenta.manoObra,35);
assert.equal(run("gcDriveDecode(JSON.parse(gcDriveSnapshot())).data.obras[0].incrementosVenta.materiales"),25);
run("db=validarV25(JSON.parse(localStorage.getItem('gc_v25_prueba_tarifas')))");assert.equal(run("ventaConIncrementosObra(by('obras','a')).total.venta"),152);
const saved=run('JSON.stringify(db)');
for(const v of ['', '-1','Infinity','abc']){context.testForm.elements.materiales.value=v;run("guardarIncrementosObra({preventDefault(){},target:testForm},'a')");assert.equal(run('JSON.stringify(db)'),saved);}
for(const v of [null,[],{materiales:10},{materiales:-1,manoObra:1},{materiales:'25',manoObra:35}]){context.bad=v;assert.throws(()=>run("validarV25({obras:[{id:'x',nombre:'X',incrementosVenta:bad}]})"));}
assert.equal(run("incrementosObra({id:'antigua'}).materiales"),0,'Obras anteriores compatibles');
assert.equal(run("ventaConIncrementosObra({id:'vacia'}).total.venta"),0);
context.testForm.elements.materiales.value='0';context.testForm.elements.manoObra.value='0';run("guardarIncrementosObra({preventDefault(){},target:testForm},'a')");assert.equal(run("ventaConIncrementosObra(by('obras','a')).total.beneficio"),0);
const beforeFailure=run('JSON.stringify(db)');run("localStorage.setItem=()=>{throw Error('Sin espacio')}");context.testForm.elements.materiales.value='50';assert.throws(()=>run("guardarIncrementosObra({preventDefault(){},target:testForm},'a')"));assert.equal(run('JSON.stringify(db)'),beforeFailure,'Fallo de guardado revierte los porcentajes');
console.log('OK: ejemplo 100→125 y 20→27, origen de costes, porcentajes por obra, vista previa, persistencia, Drive, ceros, validación, compatibilidad y reversión de guardado.');
