# 建模开发平台测试数据

仅用于 `16077` 快速手册截图。脚本使用四张已脱敏的真实天宫页面截图创建独立原型，并建立三级项目菜单、绑定、演示成员、任务、待确认候选、签出和快照。

```powershell
node ops/demo/modeling-platform/seed-test.js SEED_FUXI_TEST
```

脚本拒绝非 `16077` 地址，凭据只从当前进程环境或用户目录下发布 Skill 的 `config.env` 读取，不写入仓库。
