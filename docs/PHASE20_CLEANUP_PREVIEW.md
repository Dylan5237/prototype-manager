# 阶段 20 发布现场清理预览

- 生成时间：2026-08-29T15:13:03.7303950+00:00
- 模式：只读；未执行删除、移动、部署、切换或回滚。
- 完整机器明细：`D:\_projects\platform\FuxiPlatform\.release\phase20-cleanup-preview.json`

## 结论

- 本地 `.release`：188 项；本地 `.backup`：6 项。
- 服务器 release：49 个；生产 backup：9 个。
- 验收原型：3 个。
- 无效数据备份：8 个；这些归档只有 symlink 或没有真实文件，在有效替代备份产生前保留审计，但不得作为可恢复备份。
- 当前没有任何对象被批准删除。

## 当前 release 指针

| 环境 | 根目录 | current target | release lock |
|---|---|---|---|
| production | `/zoesoft/fuxi` | `/zoesoft/fuxi/releases/20260828-185117-c1edcab0` | False |
| test | `/zoesoft/fuxi-test` | `/zoesoft/fuxi-test/releases/20260828-181516-c1edcab0` | False |

## 远端 release

| 环境 | release | MB | 修改时间 | current | 建议 |
|---|---|---:|---|---|---|
| production | `20260811-210455-24264705` | 27.93 | 2026-08-11T13:04:57.0000000+00:00 | False | manual-review |
| test | `20260825-093644-5be0f79d` | 28.74 | 2026-08-25T01:36:47.0000000+00:00 | False | manual-review |
| test | `20260825-095734-8f2a6dbf` | 28.74 | 2026-08-25T01:57:36.0000000+00:00 | False | manual-review |
| test | `20260825-100524-2f681f55` | 28.74 | 2026-08-25T02:05:25.0000000+00:00 | False | manual-review |
| test | `20260825-101817-d6026db9` | 28.75 | 2026-08-25T02:18:19.0000000+00:00 | False | manual-review |
| test | `20260825-102736-b6d58705` | 28.75 | 2026-08-25T02:27:38.0000000+00:00 | False | manual-review |
| test | `20260825-103329-8e822a3c` | 28.75 | 2026-08-25T02:33:31.0000000+00:00 | False | manual-review |
| test | `20260825-110525-50cfd9ce` | 28.75 | 2026-08-25T03:05:27.0000000+00:00 | False | manual-review |
| test | `20260825-111043-82ac6364` | 28.75 | 2026-08-25T03:10:45.0000000+00:00 | False | manual-review |
| test | `20260825-120046-905e3456` | 28.75 | 2026-08-25T04:00:48.0000000+00:00 | False | manual-review |
| test | `20260825-140833-a360fdb9` | 28.75 | 2026-08-25T06:08:36.0000000+00:00 | False | manual-review |
| test | `20260825-141825-5f0ff9a1` | 28.75 | 2026-08-25T06:18:27.0000000+00:00 | False | manual-review |
| test | `20260825-142313-531dfe5e` | 28.75 | 2026-08-25T06:23:15.0000000+00:00 | False | manual-review |
| test | `20260825-143218-f954b3a1` | 28.75 | 2026-08-25T06:32:20.0000000+00:00 | False | manual-review |
| test | `20260825-143813-fbcc5212` | 28.75 | 2026-08-25T06:38:15.0000000+00:00 | False | manual-review |
| test | `20260825-144113-df1960fe` | 28.75 | 2026-08-25T06:41:15.0000000+00:00 | False | manual-review |
| test | `20260825-155824-d4816ce4` | 28.83 | 2026-08-25T07:58:25.0000000+00:00 | False | manual-review |
| test | `20260825-175128-ed14aaf1` | 28.83 | 2026-08-25T09:51:30.0000000+00:00 | False | manual-review |
| test | `20260826-084330-9ab9997c` | 28.89 | 2026-08-26T00:43:33.0000000+00:00 | False | manual-review |
| test | `20260826-145203-9775b32d` | 28.93 | 2026-08-26T06:52:05.0000000+00:00 | False | manual-review |
| test | `20260826-145431-9775b32d` | 28.93 | 2026-08-26T06:54:34.0000000+00:00 | False | manual-review |
| test | `20260826-193637-a70e4501` | 28.92 | 2026-08-26T11:36:39.0000000+00:00 | False | manual-review |
| test | `20260824-181807-476270fb` | 28.74 | 2026-08-24T10:18:08.0000000+00:00 | False | manual-review |
| test | `20260828-171406-8e80503a` | 28.95 | 2026-08-28T09:14:08.0000000+00:00 | False | manual-review |
| test | `20260824-174810-7beace68` | 28.73 | 2026-08-24T09:48:14.0000000+00:00 | False | manual-review |
| test | `20260824-090619-32540607` | 28.56 | 2026-08-24T01:06:21.0000000+00:00 | False | manual-review |
| production | `20260813-150416-65693945` | 27.98 | 2026-08-13T07:04:17.0000000+00:00 | False | manual-review |
| production | `20260814-113321-80b10da5` | 28.00 | 2026-08-14T03:33:22.0000000+00:00 | False | manual-review |
| production | `20260818-163336-627e2f80` | 28.25 | 2026-08-18T08:33:38.0000000+00:00 | False | manual-review |
| production | `20260825-165024-aaa0d5bb` | 28.83 | 2026-08-25T08:50:25.0000000+00:00 | False | manual-review |
| production | `20260825-175611-ed14aaf1` | 28.83 | 2026-08-25T09:56:13.0000000+00:00 | False | manual-review |
| production | `20260826-201750-cc32bd96` | 127.03 | 2026-08-26T12:17:52.0000000+00:00 | False | manual-review |
| production | `20260826-202055-cc32bd96` | 28.92 | 2026-08-26T12:20:58.0000000+00:00 | False | manual-review |
| production | `20260828-174657-8e80503a` | 28.95 | 2026-08-28T09:46:59.0000000+00:00 | False | manual-review |
| production | `20260828-185117-c1edcab0` | 28.95 | 2026-08-28T10:51:19.0000000+00:00 | True | retain-current |
| test | `20260813-153145-22fe1006` | 28.00 | 2026-08-13T07:31:47.0000000+00:00 | False | manual-review |
| test | `20260814-113321-80b10da5` | 28.00 | 2026-08-14T03:33:22.0000000+00:00 | False | manual-review |
| test | `20260818-163336-627e2f80` | 28.25 | 2026-08-18T08:33:38.0000000+00:00 | False | manual-review |
| test | `20260820-115227-8ee2d198` | 28.35 | 2026-08-20T03:52:29.0000000+00:00 | False | manual-review |
| test | `20260820-142344-20ea9192` | 28.38 | 2026-08-20T06:23:46.0000000+00:00 | False | manual-review |
| test | `20260820-144242-6f9ee1e0` | 28.38 | 2026-08-20T06:42:44.0000000+00:00 | False | manual-review |
| test | `20260820-181557-7ef74ef6` | 28.40 | 2026-08-20T10:16:00.0000000+00:00 | False | manual-review |
| test | `20260821-100301-18cc97a4` | 28.46 | 2026-08-21T02:03:03.0000000+00:00 | False | manual-review |
| test | `20260821-173152-f71bcd2e` | 28.56 | 2026-08-21T09:31:54.0000000+00:00 | False | manual-review |
| test | `20260821-173807-ee5505e0` | 28.56 | 2026-08-21T09:38:10.0000000+00:00 | False | manual-review |
| test | `20260821-174207-cbd7d598` | 28.56 | 2026-08-21T09:42:09.0000000+00:00 | False | manual-review |
| test | `20260821-180423-d6e7e657` | 28.56 | 2026-08-21T10:04:25.0000000+00:00 | False | manual-review |
| test | `20260824-094737-82e672c3` | 28.56 | 2026-08-24T01:47:39.0000000+00:00 | False | manual-review |
| test | `20260828-181516-c1edcab0` | 28.95 | 2026-08-28T10:15:18.0000000+00:00 | True | retain-current |

## 生产 backup

| backup | MB | candidate | previous target | 普通文件 | symlink | 数据可恢复 | 建议 |
|---|---:|---|---|---:|---:|---|---|
| `20260811-210601-pre-20260811-210455-24264705` | 1,701.76 | `20260811-210455-24264705` | `/zoesoft/fuxi/fuxi-platform` | 17938 | 0 | True | manual-review |
| `20260813-150834-pre-20260813-150416-65693945` | 0.18 | `20260813-150416-65693945` | `/zoesoft/fuxi/releases/20260811-210455-24264705/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260814-113500-pre-20260814-113321-80b10da5` | 0.18 | `20260814-113321-80b10da5` | `/zoesoft/fuxi/releases/20260813-150416-65693945/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260818-174504-pre-20260818-163336-627e2f80` | 0.16 | `20260818-163336-627e2f80` | `/zoesoft/fuxi/releases/20260814-113321-80b10da5/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260825-165051-pre-20260825-165024-aaa0d5bb` | 0.18 | `20260825-165024-aaa0d5bb` | `/zoesoft/fuxi/releases/20260818-163336-627e2f80/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260825-175630-pre-20260825-175611-ed14aaf1` | 0.18 | `20260825-175611-ed14aaf1` | `/zoesoft/fuxi/releases/20260825-165024-aaa0d5bb/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260826-202127-pre-20260826-202055-cc32bd96` | 0.18 | `20260826-202055-cc32bd96` | `/zoesoft/fuxi/releases/20260825-175611-ed14aaf1/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260828-174945-pre-20260828-174657-8e80503a` | 0.18 | `20260828-174657-8e80503a` | `/zoesoft/fuxi/releases/20260826-202055-cc32bd96/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |
| `20260828-185136-pre-20260828-185117-c1edcab0` | 0.18 | `20260828-185117-c1edcab0` | `/zoesoft/fuxi/releases/20260828-174657-8e80503a/platform` | 0 | 3 | False | retain-invalid-for-audit-until-replacement-exists |

## 验收原型

| ID | 名称 | 版本 | 更新时间 | 建议 |
|---|---|---:|---|---|
| `mtcu9iux0v6ddc` | [RELEASE-ACCEPTANCE] Fuxi UI 20260828 c1edcab0 | 1 | 08/28/2026 10:58:45 | manual-review |
| `mtcrv785hpvti6` | v1.0.1-beta-acceptance-20260828-175135 | 1 | 08/28/2026 09:51:37 | manual-review |
| `mta2hdjc4f1g1q` | [ACCEPTANCE] Fuxi Production Release 20260826-202055-cc32bd96 | 1 | 08/26/2026 12:25:29 | manual-review |

## 本地产物汇总

| 类别 | 数量 | MB |
|---|---:|---:|
| archive | 55 | 0.00 |
| json-report | 22 | 0.00 |
| manifest | 55 | 0.00 |
| other | 56 | 0.00 |

本地 `.backup`、未跟踪文件、worktree 和逐文件明细保存在机器 JSON 中；未确认前不处理。

## 人工决策门

1. 先通过修正后的发布脚本生成一份真实包含数据文件的新备份，再讨论旧无效备份。
2. 明确测试 release、生产 release、本地 archive 和生产 backup 的保留数量/期限。
3. 对三个验收原型逐一决定保留审计或删除；删除前确认没有分享链接或业务引用。
4. 删除动作必须在完整汇报后再次明确确认，本预览不构成授权。
