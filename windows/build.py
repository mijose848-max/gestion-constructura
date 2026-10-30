from pathlib import Path
import sys,re
source=Path(sys.argv[1] if len(sys.argv)>1 else 'index.html').read_text(encoding='utf-8')
out=Path(sys.argv[2] if len(sys.argv)>2 else 'windows/dist/www')
out.mkdir(parents=True,exist_ok=True)
# Cambia únicamente el adaptador de persistencia de la edición de escritorio.
source=re.sub(r'\blocalStorage\b','desktopStorage',source)
source=source.replace('<title>Gestión Constructora V25</title>','<title>Gestión Constructora · Windows local</title>',1)
source=source.replace('</head>','<!-- GC_DESKTOP_BOOTSTRAP --></head>',1)
source=source.replace('<script>','<script src="/vendor/xlsx.full.min.js"></script><script src="/desktop-storage.js"></script><script>',1)
loader="""async function cargarLectorPDF(){if(window.pdfjsLib)return window.pdfjsLib;const lib=await import('/vendor/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';window.pdfjsLib={...lib,getDocument:source=>lib.getDocument({...source,cMapUrl:'/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/standard_fonts/',wasmUrl:'/vendor/wasm/',isEvalSupported:false})};return window.pdfjsLib}"""
source,count=re.subn(r'^async function cargarLectorPDF\(\)[^\n]+',lambda _:loader,source,flags=re.M)
assert count==1,'No se encontró el lector PDF esperado'
source=source.replace('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','/vendor/xlsx.full.min.js')
source=source.replace('este navegador','este ordenador').replace('este equipo y navegador','este ordenador')
source=source.replace('</script>',Path(__file__).with_name('desktop-ui.js').read_text(encoding='utf-8')+'\n</script>',1)
(out/'index.html').write_text(source,encoding='utf-8')
(out/'desktop-storage.js').write_text(Path(__file__).with_name('desktop-storage.js').read_text(encoding='utf-8'),encoding='utf-8')
assert 'GC_DESKTOP_BOOTSTRAP' in source
assert 'cdnjs.cloudflare.com' not in source
print('Interfaz local preparada:',out)
