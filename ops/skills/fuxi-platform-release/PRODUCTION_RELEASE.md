# 正式环境发布入口

正式环境只能从内网 GitLab 的两个 `main` 分支构建，不使用当前开发工作树，也不使用 `origin` GitHub 仓库。

## 来源

- 平台：`http://192.168.2.145:11980/fuxi/fuxi-platform`
- Skill：`http://192.168.2.145:11980/fuxi/fuxi-prototype-skills`

脚本使用 Git 当前配置的凭据助手或受控凭据环境，不把账号、密码或 token 写入参数、日志或仓库。

## 流程

```powershell
# 1. 只读采集生产基线（需要当前进程中的 FUXI_USERNAME/FUXI_PASSWORD）
.\capture-production-baseline.ps1 -OutputPath .\.release\production-baseline.json

# 2. 从 GitLab main 新鲜拉取两个仓库，完整构建并在获得确认后部署
.\deploy-production-from-gitlab.ps1 `
  -BaselinePath .\.release\production-baseline.json `
  -ConfirmProductionDeploy DEPLOY_FUXI_PRODUCTION
```

脚本会在临时目录中完成以下动作：

1. `git clone --branch main --single-branch` 拉取平台和 Skill 仓库；
2. 校验两个 checkout 都处于 `main` 且干净；
3. 安装前端、后端依赖；
4. 执行完整前端构建、MCP 静态检查和集成测试；
5. 生成带平台 commit、Skill commit、SHA-256 的不可变制品；
6. 调用现有生产低层部署脚本，执行基线、备份、切换、Nginx 和健康门禁。

生产仍然是持续交付：必须人工提供 `DEPLOY_FUXI_PRODUCTION`，脚本不会因为 GitLab `main` 有新提交而自动切换 16088。

## 测试环境快速入口

测试环境使用当前本地工作树，直接执行：

```powershell
.\quick-deploy-test.ps1 -ConfirmTestDeploy DEPLOY_FUXI_TEST
```

它使用 `-Lightweight` 构建并部署到 16077，完整 MCP 回归留给人工验收；正式环境禁止复用这条入口。
