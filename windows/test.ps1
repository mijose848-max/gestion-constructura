$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'dist/GestionConstructora.exe'
$test=Start-Process $exe -ArgumentList '--selftest' -Wait -PassThru
if($test.ExitCode -ne 0){throw 'Fallaron las pruebas de persistencia y copias'}
$data=Join-Path $env:RUNNER_TEMP ('gc-http-'+[guid]::NewGuid().ToString('N'))
$port=49372;$url="http://localhost:$port"
$server=$null
function Start-TestServer {
 $script:server=Start-Process $exe -ArgumentList @('--headless','--port',"$port",'--data-dir',('"'+$data+'"')) -PassThru
 for($i=0;$i -lt 50;$i++){
  try{$r=Invoke-WebRequest "$url/" -UseBasicParsing;$html=$r.Content;if($html -match '"token":"([^"]+)"'){$script:headers=@{'X-GC-Token'=$Matches[1]};return}}catch{Start-Sleep -Milliseconds 200}
 }
 throw 'No se abrió el servidor de prueba'
}
function Assert($condition,$message){if(-not $condition){throw $message}}
function Expect-Status($path,$expected,$headersToUse){try{$r=Invoke-WebRequest "$url$path" -Headers $headersToUse -UseBasicParsing;$status=[int]$r.StatusCode}catch{$status=[int]$_.Exception.Response.StatusCode};Assert ($status -eq $expected) "HTTP $path esperado $expected obtenido $status"}
try {
 Start-TestServer
 Expect-Status '/api/storage' 401 @{}
 $cross=@{'X-GC-Token'=$headers['X-GC-Token'];Origin='https://example.invalid'};Expect-Status '/api/storage' 403 $cross
 Expect-Status '/estado.json' 404 @{}
 $state=Invoke-RestMethod "$url/api/storage" -Headers $headers
 Assert ($state.revision -eq 0) 'Estado inicial'
 $body=@{expectedRevision=0;key='gc_v25_prueba_tarifas';value='{"obras":[]}'} | ConvertTo-Json -Compress
 $saved=Invoke-RestMethod "$url/api/storage" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
 Assert ($saved.revision -eq 1) 'No se guardó la revisión'
 try{Invoke-RestMethod "$url/api/storage" -Method Post -Headers $headers -ContentType 'application/json' -Body $body | Out-Null;throw 'No detectó el conflicto'}catch{Assert ([int]$_.Exception.Response.StatusCode -eq 409) 'No devolvió conflicto de revisión'}
 Stop-Process -Id $server.Id -Force;$server=$null;Start-TestServer
 $state=Invoke-RestMethod "$url/api/storage" -Headers $headers
 Assert ($state.values.gc_v25_prueba_tarifas -eq '{"obras":[]}') 'No conservó los datos tras reiniciar'
 $pdf=Invoke-WebRequest "$url/vendor/pdf.mjs" -UseBasicParsing
 Assert ($pdf.RawContentLength -gt 100000) 'Falta PDF.js local'
 $xlsx=Invoke-WebRequest "$url/vendor/xlsx.full.min.js" -UseBasicParsing
 Assert ($xlsx.RawContentLength -gt 100000) 'Falta SheetJS local'
 $env:GC_TEST_URL=$url
 node (Join-Path $PSScriptRoot 'ui-test.cjs')
 if($LASTEXITCODE -ne 0){throw 'Falló la prueba de interfaz sin Internet'}
 Write-Host 'OK: compilación, persistencia, copias, protección de acceso, reinicio e interfaz offline.'
}finally{if($server -and -not $server.HasExited){Stop-Process -Id $server.Id -Force};if(Test-Path $data){Remove-Item $data -Recurse -Force}}
