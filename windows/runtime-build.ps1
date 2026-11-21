$ErrorActionPreference='Stop'
$out=Join-Path $PSScriptRoot 'runtime-dist'
$www=Join-Path $out 'www'
$vendor=Join-Path $www 'vendor'
$deps=Join-Path $env:RUNNER_TEMP 'gc-runtime-ocr-deps'
New-Item -ItemType Directory -Force -Path $www,$vendor | Out-Null
npm install --prefix $deps --ignore-scripts --no-package-lock --no-audit --no-fund tesseract.js@5.1.1 '@tesseract.js-data/spa@1.0.0' '@tesseract.js-data/eng@1.0.0' playwright@1.56.1
if($LASTEXITCODE -ne 0){throw 'No se pudieron preparar los componentes OCR'}
$ocr=Join-Path $vendor 'ocr'
New-Item -ItemType Directory -Force -Path $ocr,(Join-Path $ocr 'core'),(Join-Path $ocr 'langs') | Out-Null
$tess=Join-Path $deps 'node_modules/tesseract.js'
Copy-Item (Join-Path $tess 'dist/tesseract.min.js') $ocr
Copy-Item (Join-Path $tess 'dist/worker.min.js') $ocr
Get-ChildItem (Join-Path $deps 'node_modules/tesseract.js-core') -File | Where-Object {$_.Name -match '\.(js|wasm)$'} | Copy-Item -Destination (Join-Path $ocr 'core')
foreach($lang in @('spa','eng')){
 $model=Get-ChildItem (Join-Path $deps "node_modules/@tesseract.js-data/$lang") -Filter "$lang.traineddata.gz" -File -Recurse | Sort-Object FullName | Select-Object -First 1
 if(-not $model){throw "Falta modelo $lang"};Copy-Item $model.FullName (Join-Path $ocr "langs/$lang.traineddata.gz")
}
$licenses=Join-Path $out 'Licencias';New-Item -ItemType Directory -Force -Path $licenses | Out-Null
foreach($package in @('tesseract.js','tesseract.js-core','@tesseract.js-data/eng','@tesseract.js-data/spa')){
 $license=Get-ChildItem (Join-Path $deps "node_modules/$package") -File | Where-Object {$_.Name -match '^LICENSE'} | Select-Object -First 1
 if($license){Copy-Item $license.FullName (Join-Path $licenses ($package.Replace('/','-').Replace('@','')+'-LICENSE.txt'))}
}
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 "/out:$out/GestionConstructora.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Core.dll (Join-Path $PSScriptRoot 'Program.cs')
if($LASTEXITCODE -ne 0){throw 'No se pudo compilar el motor Windows'}
Copy-Item (Join-Path $PSScriptRoot 'desktop-storage.js') $www
'<!doctype html><html><head><!-- GC_DESKTOP_BOOTSTRAP --></head><body><h1>Motor de aplicación</h1><script src="/desktop-storage.js"></script></body></html>' | Set-Content (Join-Path $www 'index.html') -Encoding UTF8
$env:GC_PLAYWRIGHT=Join-Path $deps 'node_modules/playwright'
$env:GC_TEST_URL='http://localhost:49373'
$data=Join-Path $env:RUNNER_TEMP ('gc-runtime-test-'+[guid]::NewGuid().ToString('N'))
$server=Start-Process (Join-Path $out 'GestionConstructora.exe') -ArgumentList @('--headless','--port','49373','--data-dir',('"'+$data+'"')) -PassThru
try{
 for($i=0;$i -lt 50;$i++){try{Invoke-WebRequest $env:GC_TEST_URL -UseBasicParsing | Out-Null;break}catch{Start-Sleep -Milliseconds 200}}
 node (Join-Path $PSScriptRoot 'runtime-test.cjs')
 if($LASTEXITCODE -ne 0){throw 'Falló la prueba del motor local'}
 node (Join-Path $PSScriptRoot 'runtime-scanner-test.cjs')
 if($LASTEXITCODE -ne 0){throw 'Falló la prueba de la pestaña del escáner'}
}finally{if(-not $server.HasExited){Stop-Process -Id $server.Id -Force}}
