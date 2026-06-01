$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $AppDir "venv\Scripts\python.exe"
$App = Join-Path $AppDir "app.py"
$EnvFile = Join-Path $AppDir "rembg-local.env"
$EnvExample = Join-Path $AppDir "rembg-local.env.example"

if (-not (Test-Path -LiteralPath $Python)) {
  Write-Host "未找到 Python：$Python" -ForegroundColor Red
  Write-Host "请先创建虚拟环境并安装 requirements-rembg-local.txt。" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
  Write-Host "已创建本地配置：$EnvFile"
}

Set-Location -LiteralPath $AppDir
Write-Host "启动本地 Rembg 工具箱：http://127.0.0.1:7860"
& $Python $App
