# study-nest-js

NestJS 后端 + MySQL/Redis + AI 会话。

- 前端仓库：https://github.com/suipianma/admin-web  
- **从零配置： [SETUP.md](./SETUP.md)**  
- 环境说明：[环境.md](./环境.md)  
- Docker 部署：[deploy/README.md](./deploy/README.md)

## 本地开发（与 admin-web 同级目录）

```powershell
.\scripts\setup-dev.ps1
pnpm run start:dev
```

## Docker 部署栈

```powershell
.\scripts\setup-deploy.ps1
```

## 远程

```powershell
git remote add origin https://github.com/suipianma/study-nest-js.git
git push -u origin main
```
