$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $AppDir "venv\Scripts\python.exe"
$Worker = Join-Path $AppDir "local_worker.py"
$EnvFile = Join-Path $AppDir "local-worker.env"
$EnvExample = Join-Path $AppDir "local-worker.env.example"

if (-not (Test-Path -LiteralPath $Python)) {
  Write-Host "未找到 Python：$Python" -ForegroundColor Red
  Write-Host "请先创建虚拟环境并安装 requirements-rembg-local.txt。" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
  Write-Host "已创建本地 worker 配置：$EnvFile" -ForegroundColor Yellow
  Write-Host "请先填写 LOCAL_WORKER_SECRET，然后重新运行本脚本。" -ForegroundColor Yellow
  exit 1
}

Set-Location -LiteralPath $AppDir
& $Python $Worker
