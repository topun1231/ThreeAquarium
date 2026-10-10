$ErrorActionPreference='Stop'
try {
 $formalRoot=(Resolve-Path -LiteralPath 'D:/Aquarium_WorkEvidence/Current/AQ_TANKSTYLE001/PreviewProject').Path
 $editors=@(Get-Process | Where-Object { $_.ProcessName -in @('Tuanjie','Unity') })
 if($editors.Count -gt 0){throw 'Editor still active'}
 $targets=@((Join-Path $formalRoot 'Assets/Editor/ThreeCatalogExport.cs'),(Join-Path $formalRoot 'Assets/Editor/ThreeCatalogExport.cs.meta'),(Join-Path $formalRoot 'Library'))
 $deleted=@()
 foreach($target in $targets){
  if(!(Test-Path -LiteralPath $target)){continue}
  $item=Get-Item -LiteralPath $target
  $resolved=$item.FullName
  if(!$resolved.StartsWith($formalRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Outside formal project'}
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Unexpected reparse point'}
  if($item.PSIsContainer){$bytes=(Get-ChildItem -LiteralPath $resolved -File -Recurse | Measure-Object Length -Sum).Sum;Remove-Item -LiteralPath $resolved -Recurse -Force}else{$bytes=$item.Length;Remove-Item -LiteralPath $resolved -Force}
  $deleted+=@{path=$resolved;bytes=$bytes}
 }
 $deleted | ConvertTo-Json | Set-Content -LiteralPath 'D:/Fish tank/ThreeAquarium/evidence/temp-cleanup.json' -Encoding utf8
 $deleted | ConvertTo-Json
} catch { Write-Output $_.Exception.ToString();exit 1 }
