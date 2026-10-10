$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
try {
 $running=Invoke-RestMethod -Uri 'http://127.0.0.1:5173/health' -TimeoutSec 1
 if($running.app -eq 'three-aquarium'){Start-Process 'http://127.0.0.1:5173';exit 0}
} catch {}
if(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 5173){throw 'Port 5173 is already in use. Close the other service before starting Aquarium.'}
$nodePath=(Get-Command node.exe).Source
if(!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))){throw 'Run npm ci and npm run build in ThreeAquarium first.'}
Start-Process -FilePath $nodePath -ArgumentList 'tools/serve.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'evidence/server.log') -RedirectStandardError (Join-Path $projectRoot 'evidence/server-errors.log')
for($attempt=0;$attempt -lt 40;$attempt++){
 try{ $health=Invoke-RestMethod -Uri 'http://127.0.0.1:5173/health' -TimeoutSec 1;if($health.app -eq 'three-aquarium'){Start-Process 'http://127.0.0.1:5173';exit 0} }catch{}
 Start-Sleep -Milliseconds 250
}
throw 'Aquarium failed to start. See evidence/server-errors.log.'
