param(
    [ValidateRange(1,65535)][int]$Port = 5174,
    [switch]$ConfigureStartup,
    [switch]$AtLogon,
    [string]$StartupFolder = [Environment]::GetFolderPath('Startup','DoNotVerify')
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if ($ConfigureStartup) {
    $linkPath = Join-Path $StartupFolder "ThreeAquarium Wallpaper $Port.lnk"
    $owner = "ThreeAquarium wallpaper service ($Port)"
    $shell = New-Object -ComObject WScript.Shell
    $exists = Test-Path -LiteralPath $linkPath
    $link = $shell.CreateShortcut($linkPath)
    if ($exists -and $link.Description -ne $owner) {
        throw "此位置已有其他快捷方式，已保留原文件：$linkPath"
    }
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port -AtLogon"
    $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $projectDir = (Get-Location).Path
    $current = $exists -and $link.TargetPath -eq $exe -and $link.Arguments -ceq $arguments -and $link.WorkingDirectory -eq $projectDir
    if ($current) { Write-Host '本项目的鱼缸服务已设为登录后启动。' }
    elseif ($exists) { Write-Host '已有旧的启动项。选 1 可以更新到当前项目。' }
    else { Write-Host '本项目尚未设置登录后启动。' }
    $action = Read-Host '1 开启或更新　2 关闭　回车退出'
    if ($action -eq '1') {
        if (!$current) {
            [void][IO.Directory]::CreateDirectory($StartupFolder)
            $link.TargetPath = $exe
            $link.Arguments = $arguments
            $link.WorkingDirectory = $projectDir
            $link.WindowStyle = 7
            $link.Description = $owner
            $link.Save()
        }
        Write-Host '已开启。下次登录 Windows 后会最小化运行本机鱼缸服务。'
    } elseif ($action -eq '2') {
        if ($exists) { Remove-Item -LiteralPath $linkPath }
        Write-Host '已关闭此启动项。正在播放的鱼缸可继续播放。'
    }
    exit 0
}
$origin = "http://127.0.0.1:$Port"
function Test-PortOccupied {
    $client = [Net.Sockets.TcpClient]::new()
    try { $client.Connect([Net.IPAddress]::Loopback, $Port); return $true }
    catch [Net.Sockets.SocketException] {
        if ($_.Exception.SocketErrorCode -ne 'ConnectionRefused') { throw }
        return $false
    } finally { $client.Dispose() }
}
$waiting = $false
$failures = 0
while ($true) {
    if (Test-PortOccupied) {
        try { $health = Invoke-RestMethod -Uri "$origin/api/wallpaper/health" -MaximumRedirection 0 -TimeoutSec 2 }
        catch { $health = $null }
        if ($health.service -eq 'three-aquarium-wallpaper') {
            Write-Host '实时壁纸服务已经在运行。'
            if (!$AtLogon) { exit 0 }
            Write-Host '登录启动器将复用现有服务，端口释放后自动接续。'
            while (Test-PortOccupied) { Start-Sleep -Seconds 5 }
            $failures = 0
            $waiting = $false
            continue
        }
        if (!$waiting) { Write-Host "正在等候本机端口 $Port。端口可用后将自动打开鱼缸服务；按 Ctrl+C 退出。" }
        $waiting = $true
        Start-Sleep -Seconds 5
        continue
    }
    if (!(Get-Command node.exe -ErrorAction SilentlyContinue) -or !(Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
        throw '请先按项目 README 安装 Node.js，并在 ThreeAquarium 目录运行 npm ci。'
    }
    Write-Host "实时壁纸服务 $origin  ·  可以最小化此窗口。关闭窗口或按 Ctrl+C 即停止本次服务。"
    $uptime = [Diagnostics.Stopwatch]::StartNew()
    & node.exe node_modules/vite/bin/vite.js --host 127.0.0.1 --port $Port --strictPort
    $result = $LASTEXITCODE
    if ($result -in @(0, 130, 143, -1073741510)) { exit $result }
    if (Test-PortOccupied) { continue }
    if ($uptime.Elapsed.TotalMinutes -ge 1) { $failures = 0 }
    $failures++
    if ($failures -ge 3) {
        Write-Host "实时壁纸服务连续启动失败，已停止重试。请查看此窗口上方的错误信息。"
        exit $result
    }
    $delay = 2 * $failures
    Write-Host "实时壁纸服务意外退出（$result），将在 $delay 秒后重试。按 Ctrl+C 退出。"
    Start-Sleep -Seconds $delay
}
