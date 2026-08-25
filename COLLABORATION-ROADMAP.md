# 伏羲平台 - 产品团队多人协作迭代计划

> 创建时间: 2026-06-12
> 状态: 已归档（规划阶段文档，实现状态见下方注释）

---

## 一、当前问题

### Skill 打包内容不足

| 场景 | 当前打包内容 | 丢失的关键信息 |
|------|-------------|---------------|
| 有 `dist/` | dist/ 构建产物 + .md 文件 | 源码、package.json、构建配置、开发环境信息 |
| 无 `dist/` | 全量文件 | 项目元数据、开发规范 |

**核心问题**：上传的原型只有构建产物，团队成员无法接手继续开发，无法形成协作闭环。

### 平台协作能力缺失

- 原型只能在线预览，没有「拉取到本地开发」的能力
- 没有原型 Fork/克隆机制
- 版本之间没有 Diff 对比
- 评论反馈没有与具体代码/文件关联的能力
- 原型没有状态流转（开发中 → 评审中 → 已定稿）

---

## 二、三层协作体系设计

### 第一层：Skill 打包增强 — 让上传的原型「可复用、可接手」

**打包结构改造：**

```
上传的 ZIP 结构（改造后）：
├── dist/                    # 构建产物（用于在线预览）
│   ├── index.html
│   └── assets/
├── src/                     # 源码（用于接手开发）
│   ├── views/
│   └── components/
├── package.json             # 依赖声明
├── vite.config.ts           # 构建配置
├── tsconfig.json
├── README.md                # 项目说明
├── AGENTS.md                # AI 协作约定
├── .fuxi-meta.json          # 🆕 伏羲平台元数据（新增）
└── docs/                    # 设计文档
```

**`.fuxi-meta.json` 元数据规范：**

```json
{
  "name": "权限校验原型",
  "techStack": ["Vue 3", "Element Plus", "Vite"],
  "nodeVersion": ">=18",
  "devCommand": "npm run dev",
  "buildCommand": "npm run build",
  "author": "zhangsan",
  "relatedRequirements": ["需求单-2024-001"],
  "designSpec": "https://figma.com/xxx",
  "description": "基于Vue3的权限管理组件，支持角色/权限/菜单配置",
  "tags": ["权限", "Vue3", "B端"],
  "handover": {
    "status": "wip",
    "notes": "登录页已完成，注册页待开发",
    "knownIssues": ["移动端适配未完成"]
  }
}
```

**打包策略改造要点：**

| 改动 | 说明 |
|------|------|
| 始终打包源码 | 不再只打 dist/，而是 dist/ + 源码 + 配置文件 |
| 生成 .fuxi-meta.json | 从 package.json / git 自动推断，也支持手动维护 |
| 排除策略优化 | 排除 node_modules、.git、dist 中的 sourcemap、本地数据库等 |
| 体积控制 | 如果源码+dist 过大，提供 `--preview-only` 参数仅上传 dist |

### 第二层：平台能力增强 — 让原型「可流转、可协作」

**1. 原型下载 / 拉取**

```
新增 API:
  GET /api/prototypes/:id/download              → 下载完整 ZIP（含源码+构建产物）
  GET /api/prototypes/:id/download?mode=preview → 仅下载 dist

前端:
  详情页增加「下载原型」按钮

Skill pull 模式:
  node pack-and-upload.js pull <原型ID> [目标路径]
```

协作闭环：上传 → 评审 → 拉取 → 修改 → 再上传

**2. 原型状态流转**

```
pending → wip(开发中) → review(评审中) → approved(已定稿) → archived(已归档)

- 创建时默认 pending
- 首次上传后变为 wip
- 创建者可标记为 review / approved
- review 状态下，被分享者可以下载但不能修改
- approved 后锁定，只有 admin 能解锁
```

**3. 版本对比 (Diff)**

```
新增 API:
  GET /api/prototypes/:id/diff?v1=3&v2=5  → 返回两个版本间的文件差异

前端:
  版本历史表格增加「对比」功能，选择两个版本查看文件级 diff
```

**4. 原型 Fork**

```
新增 API:
  POST /api/prototypes/:id/fork  → 复制一份原型到当前用户名下

前端:
  详情页增加「Fork」按钮（对所有登录用户可见）
  Fork 后自动关联原原型（显示「Forked from xxx」）
```

### 第三层：协作流程 — 让团队「有规范、有节奏」

**1. 原型交付规范**

每个原型上传时必须包含：
- ✅ README.md — 项目说明（已有）
- ✅ 构建产物 — 用于在线预览（已有）
- ✅ 源码 — 用于接手开发（改造后）
- ✅ .fuxi-meta.json — 元数据（新增）
- ✅ AGENTS.md — AI 协作约定（推荐）

**2. 评审流程**

```
开发者上传原型 → 标记 review → 分享给评审人
                              → 评审人在线预览 + 评论反馈
                              → 评审通过 → 标记 approved
                              → 评审不通过 → 评论打回 → 开发者修改后重新上传
```

**3. 原型市场 / 模板库**

```
- approved 的原型自动进入「模板库」
- 其他人可以 Fork 模板快速启动新项目
- 模板库按分类/标签浏览
```

---

## 三、优先级与排期建议

| 优先级 | 内容 | 工作量 | 价值 |
|--------|------|--------|------|
| **P0** | Skill 打包增强（源码+meta+配置） | 小 | 高 — 解决核心问题 |
| **P0** | 原型下载 API + Skill pull 模式 | 中 | 高 — 打通协作闭环 |
| **P1** | 原型状态流转 | 中 | 中 — 规范流程 |
| **P1** | 原型 Fork | 中 | 中 — 促进复用 |
| **P2** | 版本 Diff | 大 | 中 — 提升评审效率 |
| **P2** | 模板库 | 中 | 低 — 锦上添花 |

---

## 四、依赖关系

```
P0-Skill打包增强 ──→ P0-原型下载/pull ──→ P1-Fork
                                            ↓
P1-状态流转 ──→ P2-模板库
                  ↓
              P2-版本Diff
```

---

## 五、备注

- 本计划为初版方案，待团队评审确认后开始实施
- P0 项可立即启动，预计 1-2 天完成
- 后续迭代根据团队实际使用情况调整优先级

---

## 六、实现状态注释（2026-08-12 更新）

本文档为 2026-06-12 规划阶段产物。实际实现路径与本文档有差异：

- **Skill 打包增强**：未采用 `.fuxi-meta.json` 方案。`fuxi-packager` 和 `deployment-validator` 已废弃，原型打包规则统一由 `fuxi-adapter` 固定契约定义。
- **原型下载 / 拉取**：未实现独立 pull 模式。原型管理统一走伏羲 MCP 的 `deliver_project` 安全交付。
- **原型状态流转**：未实现 `pending -> wip -> review -> approved` 状态机。
- **原型 Fork**：未实现。
- **版本 Diff**：未实现。
- **模板库**：未实现。
- **项目化协作（历史方案）**：曾在 `ITERATION_PLAN.md` 中设计并在 `feature/project-collaboration` 分支实现；当前实施入口已切换为无 Git 轻协作 MVP，详见 `docs/TECHNICAL_DESIGN.md`。

权威文档为 `docs/TECHNICAL_DESIGN.md` 和 `docs/MCP_SKILLS_EVOLUTION_JOURNEY.md`。本文档保留为规划历史记录。
