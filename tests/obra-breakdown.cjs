const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.env.GC_TEST_INDEX||path.join(__dirname,'..','index.html'),'utf8');
const elements={},storage=new Map(),alerts=[];
const el=()=>({innerHTML:'',textContent:'',style:{},append(){},prepend(){},appendChild(){},insertAdjacentHTML(){},querySelector(){return el()},querySelectorAll(){return[]},elements:{obra:{},estado:{}},addEventListener(){},scrollIntoView(){},focus(){},remove(){}});
const context={Intl,Date,Math,Number,JSON,String,Map,Set,Array,Object,Blob,URLSearchParams,AbortSignal,console,setTimeout(){},clearTimeout(){},setInterval(){},alert:s=>alerts.push(s),confirm:()=>true,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:k=>elements[k]??=el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),head:el()},window:{scrollTo(){},addEventListener(){}},FormData:class{constructor(f){this.f=f}entries(){return Object.entries(this.f.values)}}};
const ctx=vm.createContext(context),run=s=>vm.runInContext(s,ctx);
run(html.match(/<script>([\s\S]*)<\/script>/)[1]);
run("db=blank();db.obras.push({id:'a',nombre:'Obra A',contrato:1000},{id:'b',nombre:'Obra B',contrato:2000});db.gastos.push({id:'g',obra:'a',importe:40});confirmadoV25=JSON.stringify(db);abrirDesgloseObra('a')");
function submit(values){const f={elements:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value:String(value)}]))};context.testForm=f;run("guardarLineaDesglose({preventDefault(){},target:testForm},'a')");}
submit({descripcion:'Material',unidad:'ud',cantidad:10,precioCoste:20,incremento:25});
assert.deepEqual(JSON.parse(run("JSON.stringify(totalesDesgloseObra(by('obras','a')))")),{costeTotal:200,ventaTotal:250,beneficio:50});
assert.equal(run("by('obras','a').desgloseEconomico.length"),1);
assert.equal(run("by('obras','a').contrato"),1000,'El contrato no cambia');
assert.equal(run("db.gastos[0].importe"),40,'Los costes reales no cambian');
assert.equal(run("by('obras','b').desgloseEconomico"),undefined,'Cada obra mantiene sus propias líneas');
assert.equal(JSON.parse(storage.get('gc_v25_prueba_tarifas')).obras[0].desgloseEconomico[0].cantidad,10,'Se guarda en la base local');
const firstId=run("by('obras','a').desgloseEconomico[0].id");context.firstId=firstId;
run("editarLineaDesglose('a',firstId)");submit({descripcion:'Material corregido',unidad:'ud',cantidad:5,precioCoste:20,incremento:25});
assert.equal(run("by('obras','a').desgloseEconomico.length"),1,'Editar sustituye la línea');
assert.equal(run("by('obras','a').desgloseEconomico[0].id"),firstId);
assert.equal(run("totalesDesgloseObra(by('obras','a')).beneficio"),25);
submit({descripcion:'Trabajo',unidad:'m²',cantidad:2.5,precioCoste:80,incremento:10});
assert.deepEqual(JSON.parse(run("JSON.stringify(totalesDesgloseObra(by('obras','a')))")),{costeTotal:300,ventaTotal:345,beneficio:45},'Los totales suman las líneas sin sumar cantidades de unidades distintas');
const fractional=JSON.parse(run("JSON.stringify(calcularLineaDesglose({cantidad:3,precioCoste:0.335,incremento:10}))"));assert(Math.abs(fractional.precioVenta-0.3685)<1e-10);assert.deepEqual([fractional.costeTotal,fractional.ventaTotal,fractional.beneficio],[1.01,1.11,0.1],'Redondeo de importes por línea');
const before=run('JSON.stringify(db)');
for(const changes of [{cantidad:0},{cantidad:-1},{precioCoste:-1},{incremento:-1},{cantidad:'Infinity'},{precioCoste:''},{descripcion:''}]){
 submit({descripcion:'No guardar',unidad:'ud',cantidad:1,precioCoste:10,incremento:20,...changes});assert.equal(run('JSON.stringify(db)'),before,'Los datos inválidos no modifican ninguna obra');
}
assert(run("vistaDesgloseObra().includes('TOTAL DE LA OBRA')"));
assert(run("vistaDesgloseObra().includes('345,00')"));
const snapshot=run('gcDriveSnapshot()');context.snapshot=snapshot;
assert.equal(run("gcDriveDecode(JSON.parse(snapshot)).data.obras[0].desgloseEconomico.length"),2,'Las copias de Drive conservan el desglose');
run("validarV25(JSON.parse(JSON.stringify(db)))");
run("validarV25({obras:[{id:'legacy',nombre:'Obra anterior',contrato:99}]})");
for(const bad of [{desgloseEconomico:{}},{desgloseEconomico:[{id:'x',descripcion:'Inválido',unidad:'ud',cantidad:-1,precioCoste:10,incremento:20}]},{desgloseEconomico:[{id:'x',descripcion:'A',unidad:'ud',cantidad:1,precioCoste:1,incremento:0},{id:'x',descripcion:'B',unidad:'ud',cantidad:1,precioCoste:1,incremento:0}]}]){
 context.bad=bad;assert.throws(()=>run("validarV25({obras:[{id:'bad',nombre:'Error',...bad}]})"),'Las importaciones inválidas se rechazan');
}
run("eliminarLineaDesglose('a',firstId)");assert.equal(run("by('obras','a').desgloseEconomico.length"),1);
run('deshacerV25()');assert.equal(run("by('obras','a').desgloseEconomico.length"),2,'Deshacer recupera la línea');
const saved=run('JSON.stringify(db)');run("localStorage.setItem=()=>{throw Error('Sin espacio')}");
assert.throws(()=>submit({descripcion:'Fallo',unidad:'ud',cantidad:1,precioCoste:50,incremento:10}));assert.equal(run('JSON.stringify(db)'),saved,'Un fallo de guardado revierte la nueva línea');
console.log('OK: ejemplo 200/250/50, edición, totales, decimales, validación, aislamiento entre obras, persistencia y Drive, compatibilidad con copias anteriores, deshacer y reversión ante fallo de guardado.');
