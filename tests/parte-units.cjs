const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.env.GC_TEST_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const names = ['normalizarPDFParte', 'normalizarUnidadPDFParte', 'buscarMaterialPDF', 'mostrarPDFParte'];
const functions = names.map(name => {
  const match = html.match(new RegExp('^function ' + name + '\\([^\\n]*', 'm'));
  assert(match, `No se encontró ${name}`);
  return match[0];
});
const importer = html.match(/^function guardarPDFParte\(\)\{[\s\S]*?^\}/m);
assert(importer, 'No se encontró guardarPDFParte');
const fields = {}, alerts = [];
let saved = 0, nextId = 0;
const context = {
  db: {obras: [{id:'obra',nombre:'Obra de prueba'}], materiales: [], trabajadores: [], horas: [], materialesPartes: []},
  partePDFImport: null,
  document: {
    getElementById: id => fields[id] ||= {value:'', innerHTML:''},
    querySelectorAll: selector => selector === '.parte-pdf-m:checked' ? [{dataset:{i:'0'}}] : [],
  },
  opcionesPDF: () => '', buscarNombrePDFParte: () => 'obra',
  esc: value => String(value ?? ''), fechaES: value => value,
  diasPartes: () => [], id: () => 'nuevo_' + ++nextId,
  alert: message => alerts.push(message), confirm: () => true,
  save: () => saved++, render: () => {},
};
context.by = (key, id) => context.db[key].find(record => record.id === id);
vm.createContext(context);
vm.runInContext(functions.join('\n') + '\n' + importer[0], context);
const normalize = value => context.normalizarUnidadPDFParte(value);
for (const [a,b] of [['m3','m³'],['M3','m³'],['m2','m²'],[' M³ ','m3'],['m 3','m³'],['m^3','m³'],['m^2','m²']]) {
  assert.equal(normalize(a), normalize(b), `${a} debe equivaler a ${b}`);
}
for (const [a,b] of [['m2','m3'],['m','m³'],['kg','m³'],['l','m³']]) {
  assert.notEqual(normalize(a), normalize(b), `${a} y ${b} deben seguir siendo distintas`);
}
assert.equal(context.normalizarPDFParte('m³'), 'm³', 'La normalización de nombres no cambia');
function prepare(catalogUnit, pdfUnit, catalogName='Hormigón', pdfName='Hormigón') {
  saved=0; alerts.length=0; context.db.horas=[]; context.db.materialesPartes=[];
  context.db.materiales=[{id:'material',codigo:'HM25',nombre:catalogName,unidad:catalogUnit,compra:90}];
  context.partePDFImport={obraNombre:'Obra de prueba',fecha:'2026-10-29',ts:[],ms:[{codigo:'HM25',nombre:pdfName,unidad:pdfUnit,cantidad:2.5}]};
  context.mostrarPDFParte();
  fields.partePDFObra.value='obra'; context.document.getElementById('pdfCant0').value='2.5';
}
prepare('m3','m³');
assert.equal(context.buscarMaterialPDF(context.partePDFImport.ms[0]),'material','Encuentra por nombre y unidad equivalente');
assert.equal(fields.pdfMat0.value,'material','Preselecciona el material existente');
context.guardarPDFParte();
assert.equal(saved,1,'Permite guardar el parte');
assert.equal(context.db.materiales.length,1,'No crea otro material');
assert.equal(context.db.materiales[0].unidad,'m3','No modifica la unidad del catálogo');
assert.equal(context.db.materialesPartes[0].unidad,'m3','Conserva la unidad del material registrado');
assert.equal(context.db.materialesPartes[0].cantidad,2.5,'No convierte cantidades');
assert.equal(context.db.materialesPartes[0].precio,90,'No modifica precios');
prepare('m³','m3');context.guardarPDFParte();assert.equal(saved,1,'Funciona también a la inversa');
prepare('m2','m²');context.guardarPDFParte();assert.equal(saved,1,'Reconoce metros cuadrados');
prepare('m3','m³','Hormigón catálogo','Descripción PDF diferente');
assert.equal(fields.pdfMat0.value,'material','Reconoce código idéntico aunque cambie la descripción');
prepare('m2','m³');
assert.equal(context.buscarMaterialPDF(context.partePDFImport.ms[0]),'','No asocia dimensiones distintas');
assert.equal(fields.pdfMat0.value,'','No preselecciona el material incompatible');
fields.pdfMat0.value='material';context.guardarPDFParte();
assert.equal(saved,0,'Bloquea dimensiones realmente distintas');
assert.equal(context.db.materialesPartes.length,0,'Un rechazo no escribe datos');
assert(alerts.some(message=>message.includes('unidades distintas')));
console.log('OK: equivalencias de unidades, asociación por nombre y código, importación sin duplicados ni conversiones y rechazo de dimensiones distintas.');
