# 从 Docker Hub 拉取最新镜像并重启（CI 完成后手动 CD）
# 用法：在 study-nest-js 仓库根目录执行  .\deploy\update.ps1

$ErrorActionPreference = "Stop"
$deployDir = $PSScriptRoot

Set-Location $deployDir

if (-not (Test-Path ".env")) {
  Write-Host "未找到 deploy/.env，请先执行：" -ForegroundColor Yellow
  Write-Host "  copy deploy\.env.local.example deploy\.env" -ForegroundColor Cyan
  exit 1
}

Write-Host ">>> docker compose pull" -ForegroundColor Green
docker compose pull

Write-Host ">>> docker compose up -d" -ForegroundColor Green
docker compose up -d

Write-Host ">>> docker compose ps" -ForegroundColor Green
docker compose ps

Write-Host ""
Write-Host "前端: http://localhost:3001" -ForegroundColor Cyan
Write-Host "后端: http://localhost:3000" -ForegroundColor Cyan
