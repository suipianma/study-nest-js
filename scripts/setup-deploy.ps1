# Docker 部署栈一键初始化（Windows）
# 在 study-nest-js 仓库根目录执行:  .\scripts\setup-deploy.ps1

$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path $PSScriptRoot -Parent
$DeployDir = Join-Path $BackendRoot "deploy"

Write-Host "=== AI Admin Docker 部署初始化 ===" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 docker，请先安装 Docker Desktop"
}

Set-Location $DeployDir

if (-not (Test-Path ".env")) {
  Write-Host "创建 deploy/.env ..." -ForegroundColor Yellow
  Copy-Item ".env.local.example" ".env"
}

Write-Host "`n拉取镜像（需两个仓库 CI 均已 push 过）..." -ForegroundColor Green
docker compose pull

Write-Host "`n启动服务..." -ForegroundColor Green
docker compose up -d
docker compose ps

Write-Host @"

访问:  http://localhost:3001  /  http://localhost:3000
更新:  deploy\update.ps1
"@ -ForegroundColor Yellow
