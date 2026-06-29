# 本地开发环境一键初始化（Windows）
# 在 study-nest-js 仓库根目录执行:  .\scripts\setup-dev.ps1
# 要求: 同级目录存在 admin-web（git clone 前端仓库）

$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path $PSScriptRoot -Parent
$WorkspaceRoot = Split-Path $BackendRoot -Parent
$FrontendRoot = Join-Path $WorkspaceRoot "admin-web"

Write-Host "=== AI Admin 本地开发初始化 ===" -ForegroundColor Cyan
Write-Host "后端: $BackendRoot"
Write-Host "前端: $FrontendRoot"

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Error "未找到命令: $name，请先安装（见 SETUP.md 第 1 节）"
  }
}

if (-not (Test-Path $FrontendRoot)) {
  Write-Error @"
未找到前端目录: $FrontendRoot

请在与 study-nest-js 同级目录 clone 前端:
  cd $WorkspaceRoot
  git clone https://github.com/suipianma/admin-web.git
"@
}

Require-Command git
Require-Command node
Require-Command pnpm
Require-Command npm
Require-Command docker

Write-Host "`n[1/4] 启动 MySQL + Redis + Qdrant (Docker)..." -ForegroundColor Green
Set-Location $BackendRoot
pnpm install
pnpm run docker:infra
Start-Sleep -Seconds 8

Write-Host "`n[2/4] Prisma generate + migrate..." -ForegroundColor Green
pnpm run prisma:generate
pnpm run prisma:migrate

Write-Host "`n[3/4] 安装前端依赖..." -ForegroundColor Green
Set-Location $FrontendRoot
npm install

Write-Host "`n[4/4] 完成" -ForegroundColor Green
Write-Host @"

请开两个终端:

  终端 1（后端）:
    cd $BackendRoot
    pnpm run start:dev

  终端 2（前端）:
    cd $FrontendRoot
    npm run dev

访问:
  前端  http://localhost:3001
  后端  http://localhost:3000

Ollama: ollama pull deepseek-r1:1.5b
"@ -ForegroundColor Yellow
