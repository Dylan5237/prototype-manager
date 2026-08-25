# 伏羲平台项目化协作迭代计划

> **历史方案快照**：本文记录早期 Git/项目协作方案，不是当前实施入口。当前轻协作以“任务码 → 候选 ZIP → 预览 → 采用/退回 → 基础版本 CAS”为准，见 [`docs/prototypes/lightweight-collaboration-mvp/DESIGN_SUMMARY.md`](docs/prototypes/lightweight-collaboration-mvp/DESIGN_SUMMARY.md)。

> 目标：把当前以“单个原型”为中心的平台，升级为以“项目（Project）”为中心的协作门户。一个项目对应一个业务系统（如“天宫平台”），项目下可以划分固定模块菜单，不同成员负责不同模块，最终对外提供统一的项目访问链接。

---

## 一、背景与问题

当前平台的核心单位是 **Prototype（原型）**。对于复杂业务系统（如天宫平台），一个系统往往由多个模块、几十个页面原型组成。现有模式的问题：

1. **缺少系统级容器**：原型散落在首页列表中，无法按业务系统组织。
2. **没有统一入口**：每个原型各自一个链接，无法给外部一个“天宫平台演示门户”。
3. **协作粒度太粗**：现有“协作者”只能管理整个原型，不能按模块拆分工作。
4. **多人同时改容易冲突**：没有签出锁机制，A 和 B 可能同时上传覆盖同一个原型。

---

## 二、设计目标

1. **项目作为业务系统容器**：一个项目 = 一个业务系统（天宫平台、医保中台等）。
2. **固定模块菜单**：项目 Owner 可以配置一级/二级菜单，菜单项绑定原型。
3. **统一门户链接**：`/project/:projectId` 作为对外的统一演示入口。
4. **模块级签出协作**：不同成员签出不同菜单项（原型），避免冲突。
5. **项目级版本快照**：重大节点可以保存整个项目的菜单结构 + 各原型版本快照，支持回滚。
6. **不影响主分支**：本次历史改造曾在 `feature/project-collaboration` 分支进行；该分支名和 `master` 关系只属于当时的实施快照。

---

## 三、核心概念

| 概念 | 说明 |
|---|---|
| **Project（项目）** | 业务系统容器，包含名称、描述、菜单配置、创建者。 |
| **Menu（菜单）** | 项目的固定导航结构，支持一级菜单 / 二级菜单。 |
| **Menu Item（菜单项）** | 菜单的最小叶子节点，绑定一个 Prototype。也是签出的最小单元。 |
| **ProjectPrototype（项目-原型关联）** | 记录某个原型绑定到项目的哪个菜单路径下。 |
| **Checkout（签出）** | 成员对某个菜单项加编辑锁，其他人只读。 |
| **Checkin（签入）** | 成员完成编辑后释放锁，并生成一条项目版本记录。 |
| **Snapshot（快照）** | 保存当前项目的完整状态（菜单结构 + 每个菜单项对应的原型版本）。 |

---

## 四、数据模型

### 4.1 新增表

#### `projects`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 项目 ID |
| `name` | TEXT | 项目名称 |
| `description` | TEXT | 项目描述 |
| `menu_config` | TEXT(JSON) | 菜单结构配置 |
| `created_by` | INTEGER FK | 创建者用户 ID |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `deleted_at` | TEXT | 软删除时间，NULL 表示未删除 |

#### `project_prototypes`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | 自增 ID |
| `project_id` | TEXT FK | 项目 ID |
| `prototype_id` | TEXT FK | 原型 ID |
| `menu_path` | TEXT | 菜单路径，如 `实体建模/实体列表` |
| `sort_order` | INTEGER | 同一路径下的排序 |
| `created_at` | TEXT | 创建时间 |

唯一约束：`(project_id, prototype_id, menu_path)`

#### `project_checkouts`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | 自增 ID |
| `project_id` | TEXT FK | 项目 ID |
| `project_prototype_id` | INTEGER FK | 项目-原型关联 ID |
| `user_id` | INTEGER FK | 签出人 |
| `checked_out_at` | TEXT | 签出时间 |
| `expires_at` | TEXT | 超时释放时间 |
| `status` | TEXT | `active` / `released` / `expired` / `forced` |
| `note` | TEXT | 签出说明 |

唯一约束：`(project_id, project_prototype_id, status='active')` 期间只允许一个 active 签出。

#### `project_snapshots`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | 自增 ID |
| `project_id` | TEXT FK | 项目 ID |
| `name` | TEXT | 快照名称 |
| `version_label` | TEXT | 版本标签，如 `v1.2.0` |
| `snapshot_data` | TEXT(JSON) | 快照数据：菜单结构 + 每个菜单项对应的原型版本号 |
| `created_by` | INTEGER FK | 创建者 |
| `created_at` | TEXT | 创建时间 |

### 4.2 菜单配置 JSON 示例

```json
{
  "items": [
    {
      "key": "entity",
      "label": "实体建模",
      "icon": "Document",
      "children": [
        { "key": "entity-list", "label": "实体列表" },
        { "key": "entity-detail", "label": "实体详情" }
      ]
    },
    {
      "key": "method",
      "label": "方法建模",
      "children": [
        { "key": "method-editor", "label": "方法编辑器" }
      ]
    }
  ]
}
```

`project_prototypes.menu_path` 与 `menu_config` 的叶子节点 `key` 对应，例如 `实体建模/实体列表`。

---

## 五、API 设计

### 5.1 项目基础 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 项目列表（支持 keyword 过滤） |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/:id` | 项目详情（含菜单、已绑定原型、签出状态） |
| PUT | `/api/projects/:id` | 更新项目信息 / 菜单配置 |
| DELETE | `/api/projects/:id` | 软删除项目 |

### 5.2 项目-原型绑定 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/projects/:id/prototypes` | 绑定原型到菜单项 |
| PUT | `/api/projects/:id/prototypes/:ppId` | 调整菜单路径 / 排序 |
| DELETE | `/api/projects/:id/prototypes/:ppId` | 解绑原型 |

### 5.3 签出/签入 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/projects/:id/prototypes/:ppId/checkout` | 签出 |
| POST | `/api/projects/:id/prototypes/:ppId/checkin` | 签入（释放锁） |
| POST | `/api/projects/:id/prototypes/:ppId/release` | 管理员强制释放 |

### 5.4 快照 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:id/snapshots` | 快照列表 |
| POST | `/api/projects/:id/snapshots` | 创建快照 |
| POST | `/api/projects/:id/snapshots/:snapshotId/restore` | 从快照恢复 |

### 5.5 公开门户 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:id/portal` | 不需要登录？需要登录？默认需要登录，后续可扩展为公开门户。 |

---

## 六、前端设计

### 6.1 项目列表页 `/projects`

- 卡片列表展示所有项目。
- 创建项目按钮：弹窗填写名称、描述。
- 每个项目卡片：进入门户、编辑信息、管理菜单、删除（仅 Owner/Admin）。

### 6.2 项目门户页 `/project/:id`

页面布局：

```
┌─────────────────────────────────────────────┐
│  天宫平台 — 项目门户                    [管理] │
├──────────────┬──────────────────────────────┤
│  实体建模     │                              │
│    实体列表   │      原型预览 / 占位提示      │
│    实体详情   │                              │
│  方法建模     │                              │
│    方法编辑器 │                              │
│              │                              │
└──────────────┴──────────────────────────────┘
```

- 左侧固定菜单来自 `menu_config`。
- 点击菜单项：右侧加载对应原型预览（复用现有预览逻辑）。
- 菜单项右侧显示签出状态：
  - 绿色锁：我签出的
  - 黄色锁：别人签出的（显示昵称）
  - 无锁：可签出
  - 小红点：有未同步的最新版本（可选）
- 操作按钮：签出 / 签入 / 强制释放 / 查看历史快照。

### 6.3 项目管理弹窗

- 基本信息编辑。
- 菜单配置编辑器：可视化增删改一级/二级菜单。
- 原型绑定编辑器：把原型拖拽/选择到对应菜单项。

---

## 七、权限矩阵

| 操作 | Owner | Admin | Editor | Reviewer |
|---|---|---|---|---|
| 查看项目门户 | ✅ | ✅ | ✅ | ✅ |
| 创建项目 | ✅ | ✅ | ❌ | ❌ |
| 编辑项目信息/菜单 | ✅ | ✅ | ❌ | ❌ |
| 绑定/解绑原型 | ✅ | ✅ | ❌ | ❌ |
| 签出自己负责的菜单项 | ✅ | ✅ | ✅ | ❌ |
| 签入自己签出的项 | ✅ | ✅ | ✅ | ❌ |
| 强制释放他人签出 | ✅ | ✅ | ❌ | ❌ |
| 创建/恢复快照 | ✅ | ✅ | ❌ | ❌ |
| 删除项目 | ✅ | ✅ | ❌ | ❌ |

说明：
- Owner = 项目创建者。
- Admin = 平台管理员。
- Editor = 被加入项目成员列表的编辑者（复用 `project_shares` 或 `project_members`）。
- Reviewer = 只读成员。

---

## 八、Phase 1：项目容器化（本次实现）

### 8.1 后端

1. 数据库迁移：新增 `projects`、`project_prototypes` 表。
2. 服务层：`backend/services/db-projects.js`
   - 项目 CRUD
   - 菜单配置解析/校验
   - 原型绑定/解绑
3. 路由层：`backend/routes/projects.js`
   - 项目基础 API
   - 项目-原型绑定 API
4. 注册路由：`server.js` 增加 `/api/projects`。

### 8.2 前端

1. API 封装：`frontend/src/api/projects.js`
2. 页面：
   - `ProjectsView.vue`：项目列表
   - `ProjectView.vue`：项目门户（菜单 + 预览）
3. 组件：
   - `ProjectFormDialog.vue`：创建/编辑项目
   - `ProjectMenuEditor.vue`：菜单配置
   - `ProjectPrototypeBinder.vue`：原型绑定
4. 路由：`/projects`、`/project/:id`。
5. 导航：顶部或侧边栏增加“项目”入口。

### 8.3 验收标准

- 可以创建、编辑、删除项目。
- 可以给项目配置一级/二级菜单。
- 可以把原型绑定到菜单项。
- 访问 `/project/:id` 能看到固定菜单，点击菜单项能预览对应原型。

---

## 九、Phase 2：项目内协作（本次实现）

### 9.1 后端

1. 数据库迁移：新增 `project_checkouts`、`project_snapshots` 表。
2. 服务层扩展：
   - 签出：检查是否已有 active 签出，无则创建记录，`expires_at` 默认当前时间 + 24h。
   - 签入：更新 checkout 状态为 `released`。
   - 超时释放：提供一个定时任务或查询时自动清理过期记录。
   - 强制释放：Owner/Admin 可释放他人 active 签出。
   - 快照：保存当前项目所有绑定原型的最新版本号 + 菜单配置。
   - 恢复：根据快照数据把各 `project_prototypes` 指向对应原型版本（通过更新入口文件或记录版本号）。
3. 路由扩展：checkout / checkin / release / snapshots API。

### 9.2 前端

1. 项目门户页增强：
   - 菜单项显示签出状态。
   - 提供签出/签入按钮。
   - 管理员显示“强制释放”。
2. 快照面板：
   - 列表展示历史快照。
   - 创建快照按钮。
   - 恢复快照（二次确认）。
3. 超时提示：
   - 签出时显示剩余时间。
   - 接近超时给提示。

### 9.3 验收标准

- 同一菜单项同时只能有一个 active 签出。
- 签出后其他人不能再次签出，直到签入或释放。
- 超过 24 小时未签入，系统自动释放。
- 管理员可以强制释放。
- 可以创建项目快照，并能从快照恢复菜单结构 + 原型版本。

---

## 十、与主分支的兼容性

本次改造遵循以下原则：

1. **新增表，不改旧表结构**：`projects`、`project_prototypes`、`project_checkouts`、`project_snapshots` 都是新表，不影响 `prototypes` 等核心表。
2. **新增路由，不改旧路由**：`/api/projects/*` 是新增路由，现有 `/api/prototypes/*` 逻辑不变。
3. **新增页面，不改旧页面**：`/projects`、`/project/:id` 是新路由，首页 `/` 和 `/prototype/:id` 保持不变。
4. **新增导航入口，不替换旧入口**：侧边栏/顶部增加“项目”入口，原有“原型列表”“用户管理”等保留。
5. **历史验证记录**：当时的 `feature/project-collaboration` 分支曾通过不可变 release 部署到生产；release、原型数量和零漂移数字只属于该次记录，不作为当前发布状态。

---

## 十一、后续规划（Phase 3 / Phase 4）

### Phase 3：平台内 AI Agent

- 在项目门户或原型详情页增加“AI 助手”侧边栏。
- 调用 Moonshot API，让 AI 根据项目上下文生成/修改原型。
- 把现有 Skill 封装为 Agent 工具。

### Phase 4：项目级上下文沉淀

- 建设项目级记忆库：设计规范、业务需求、代码语义索引。
- 引入 RAG，让 AI 跨会话保持一致。
- 实时通知与冲突处理。

---

## 十二、风险与应对

| 风险 | 应对 |
|---|---|
| 菜单配置 JSON 不规范导致解析失败 | 前端表单化编辑，后端做 schema 校验。 |
| 签出锁死（用户忘记签入） | 24h 自动释放 + 管理员强制释放。 |
| 快照恢复后原型入口文件不匹配 | 快照保存原型版本号，恢复时从 `prototype_versions` 读取对应入口文件。 |
| 多用户并发签出冲突 | SQLite 单进程天然串行，后端用唯一约束兜底。 |
| 分支长期不合并导致与 master 偏离 | 小步快跑，每次改动后立即在 feature 分支验证，必要时 rebase master。 |

---

## 十三、任务清单

- [x] 编写迭代计划文档
- [x] 创建历史实施分支 `feature/project-collaboration`
- [x] Phase 1 后端：项目表 + 项目-原型关联表 + API
- [x] Phase 1 前端：项目列表 + 项目门户 + 菜单配置 + 原型绑定
- [x] Phase 2 后端：签出/签入/超时释放 + 快照 API
- [x] Phase 2 前端：签出状态展示 + 快照面板
- [x] 构建验证
- [x] 生产部署与兼容验收
- [ ] 推送 feature 分支到远端
