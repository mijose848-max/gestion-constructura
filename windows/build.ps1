$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$out=Join-Path $PSScriptRoot 'dist'
python (Join-Path $PSScriptRoot 'build.py') (Join-Path $root 'index.html') (Join-Path $out 'www')
if($LASTEXITCODE -ne 0){throw 'No se pudo preparar la interfaz'}
$deps=Join-Path $env:RUNNER_TEMP 'gc-windows-deps'
npm install --prefix $deps --ignore-scripts --no-package-lock --no-audit --no-fund pdfjs-dist@6.4.299 playwright@1.56.1
if($LASTEXITCODE -ne 0){throw 'No se pudieron descargar las bibliotecas'}
$pdf=Join-Path $deps 'node_modules/pdfjs-dist'
$vendor=Join-Path $out 'www/vendor'
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
Copy-Item (Join-Path $pdf 'legacy/build/pdf.min.mjs') (Join-Path $vendor 'pdf.mjs')
Copy-Item (Join-Path $pdf 'legacy/build/pdf.worker.min.mjs') (Join-Path $vendor 'pdf.worker.mjs')
foreach($dir in @('cmaps','standard_fonts','wasm')){Copy-Item (Join-Path $pdf $dir) (Join-Path $vendor $dir) -Recurse -Force}
$licenses=Join-Path $out 'Licencias';New-Item -ItemType Directory -Force -Path $licenses | Out-Null
Copy-Item (Join-Path $pdf 'LICENSE') (Join-Path $licenses 'PDFjs-LICENSE.txt')
Invoke-WebRequest 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' -OutFile (Join-Path $vendor 'xlsx.full.min.js')
Invoke-WebRequest 'https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE' -OutFile (Join-Path $licenses 'SheetJS-LICENSE.txt')
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 "/out:$out/GestionConstructora.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Core.dll (Join-Path $PSScriptRoot 'Program.cs')
if($LASTEXITCODE -ne 0){throw 'No se pudo compilar el programa'}
Copy-Item (Join-Path $PSScriptRoot 'LEEME.txt') $out
Copy-Item (Join-Path $PSScriptRoot 'Instalar.cmd') $out
Get-ChildItem $vendor -File -Recurse | ForEach-Object {[pscustomobject]@{archivo=$_.FullName.Substring($out.Length+1);sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash}} | ConvertTo-Json | Set-Content (Join-Path $out 'bibliotecas-sha256.json') -Encoding UTF8
$env:GC_PLAYWRIGHT=Join-Path $deps 'node_modules/playwright'
& (Join-Path $PSScriptRoot 'test.ps1')
if($LASTEXITCODE -ne 0){throw 'Fallaron las pruebas de Windows'}
