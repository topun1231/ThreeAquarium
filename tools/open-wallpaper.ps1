param([Parameter(Mandatory)][string]$Entry, [string]$PreviewWindow,
      [ValidateRange(1,800)][int]$WindowWidth=800, [ValidateRange(1,600)][int]$WindowHeight=450,
      [ValidateRange(0,2147483646)][int]$MonitorIndex=0)
$ErrorActionPreference = 'Stop'
$install = (Get-ItemProperty 'HKCU:\Software\WallpaperEngine' -ErrorAction SilentlyContinue).installPath
if (!$install) { exit 3 }
$folder = Split-Path -Parent $install
$sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
$engine = Get-Process -Name wallpaper32,wallpaper64 -ErrorAction SilentlyContinue |
    Where-Object { $_.SessionId -eq $sessionId -and $_.Path -and (Split-Path -Parent $_.Path) -eq $folder } |
    Select-Object -First 1
if (!$engine) { exit 3 }
$entryPath = (Get-Item -LiteralPath $Entry).FullName
$command = @('-control','openWallpaper','-file',$entryPath)
if ($PreviewWindow) { $command += @('-playInWindow',$PreviewWindow,'-width',"$WindowWidth",'-height',"$WindowHeight") }
else {
    if ($MonitorIndex -gt 0) {
        Add-Type -AssemblyName System.Windows.Forms
        if ($MonitorIndex -ge [System.Windows.Forms.Screen]::AllScreens.Length) { exit 4 }
    }
    $command += @('-monitor',"$MonitorIndex")
}
& $engine.Path @command
if ($LASTEXITCODE) { exit 1 }
