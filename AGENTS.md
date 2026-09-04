## 重要

每次回复开头都要先喊一声"啊唯"

## 项目概述

本项目是基于 marktext/marktext 的自定义二次开发版本（custom-marktext）。AI Agent 在本仓库工作时，必须严格遵循以下规则。

## 必读文件（开始任何任务前）

1. **CUSTOMIZATIONS/README.md**——自定义开发机制的完整规则（冲突策略、标记格式、frontmatter 职责）
2. **CUSTOMIZATIONS/registry.md**——自定义改动登记账本（开发前读「改动总览」节）
3. **CLAUDE.md**——上游维护的架构说明（monorepo 布局、三进程模型、构建注意事项；勿修改）

## 工作流（写代码 / 排查问题前）

1. **先读 `CUSTOMIZATIONS/architecture.md`**：按 §0.5 任务作用域路由表确定该读哪些文件、忽略哪些；按 §2 任务→代码位置表定位。改 muya 前先读 `packages/muya/CLAUDE.md`。图谱过期时以代码为准并顺手订正。
2. **排查 bug 前先扫 `CUSTOMIZATIONS/docs/pitfalls.md` 标题**：历史坑点避免重复踩；解决新坑后回写一条。
3. 上游文件改动区域必须用 `[CUSTOM-BEGIN]/[CUSTOM-END]` 标记包裹（`.json`/`.yaml` 无法注释的文件在 registry.md 总览标注）。

## 技术栈

- pnpm monorepo：`packages/desktop`（Electron 42 + Vue 3 + Pinia + Element Plus + electron-vite）、`packages/muya`（@muyajs/core 编辑引擎，自成工具链）、`packages/muyajs`（旧引擎，退役中）、`packages/website`（官网，独立）
- 包管理器：**pnpm ≥10**（禁 npm/yarn）；Node.js ≥20.19
- 代码规范：ESLint + Prettier（无分号、单引号、2 空格）；muya 用自己的 antfu 配置
- 测试：Vitest（desktop 单测）+ Playwright（e2e）+ muya CommonMark/GFM 规范套件
- 协议：MIT

## 构建命令（全部在仓库根执行）

```bash
pnpm install          # 安装依赖（自动跑 postinstall：patch、electron 下载、原生模块重建）
pnpm run dev          # 开发模式（renderer 热重载；改 main/ 需重启 dev）
pnpm run build:unpack # 快速构建验证（不打包）
pnpm run build:win    # Windows x64 打包（NSIS + zip → 根 dist/）
pnpm run build:mac    # macOS 打包
pnpm run build:linux  # Linux 打包
pnpm run lint         # ESLint
pnpm run typecheck    # vue-tsc --noEmit
pnpm run test         # Vitest 单测
pnpm run test:e2e     # Playwright e2e
pnpm -C packages/muya test          # muya 单测
pnpm -C packages/muya test:spec     # CommonMark/GFM 规范基线
```

## Git 分支规则

| 分支               | 用途                                          | 谁可以写入                             |
| ------------------ | --------------------------------------------- | -------------------------------------- |
| `upstream/develop` | 跟踪上游 marktext/marktext（PR 合入 develop） | 只读（仅 fetch）                       |
| `vendor/develop`   | 上游版本基线（当前线）                        | 只读（仅 merge-upstream skill 可更新） |
| `vendor/vX.Y.x`    | 上游版本线分支（锚定 tag 时用）               | 只读（同上）                           |
| `custom/main`      | 自定义开发主分支                              | AI Agent 开发合并                      |
| `feature/<name>`   | 功能开发分支                                  | AI Agent 临时分支                      |

- **remote**：`origin` → https://github.com/zouv/custom-marktext；`upstream` → https://github.com/marktext/marktext
- **禁止操作**：
  - **禁止未经用户明确指示 commit / push**：完成改动后只汇报结果（改了什么、验证情况），由用户决定何时提交；用户明确说"提交"/"commit"/"push"时才执行
  - 禁止手动 `git merge` 合并 vendor 到 custom/main（必须通过 `marktext-merge-upstream` skill）
  - 禁止 `git rebase` 改写 custom/main 的历史
  - 禁止直接 push 到 vendor 分支

## 自定义代码规范（硬约束）

1. **代码隔离优先**：新功能尽量放在 `CUSTOMIZATIONS/src/` 下，通过独立模块挂载
2. **修改上游文件时必须加标记**：
   ```
   // [CUSTOM-BEGIN] CUSTOM-YYYYMMDD-NNN - 描述
   ... 自定义代码 ...
   // [CUSTOM-END] CUSTOM-YYYYMMDD-NNN
   ```
3. **每次改动必须记录**：完成后调用 `marktext-record-change` skill 更新 CUSTOMIZATIONS/registry.md
4. **不要删除 registry.md 中的历史条目**（标记 deprecated 即可）
5. **合并冲突**：按 CUSTOMIZATIONS/README.md 的冲突策略速查处理
6. **合并上游完成后、发布前**必须运行 `pnpm install && pnpm run lint && pnpm run typecheck && pnpm run build:unpack && pnpm run test`

## AI Skills 触发条件

Skill 定义位于 `.agents/skills/`（跨工具共享的工作区级标准路径；上游 `.gitignore` 忽略该目录，本仓库已反向豁免，见 pitfalls #1）。

| Skill                     | 何时调用                                  |
| ------------------------- | ----------------------------------------- |
| `marktext-record-change`  | 完成任何自定义功能/修改后                 |
| `marktext-merge-upstream` | 用户要求合并上游/升级版本/同步原仓库时    |
| `marktext-release`        | 用户要求打包/发布/打 release/生成安装包时 |

详细触发场景见各 skill 的 `.agents/skills/<name>/SKILL.md`。

## 项目结构速查

```
packages/desktop/           # Electron 应用（src/{main,preload,renderer,common,shared}）
  static/                   # 图标、主题、locales（11 语言）、preference.json 默认值
  test/{unit,e2e}/          # Vitest / Playwright
packages/muya/              # TS 编辑引擎（block 树 + ot-json1 + snabbdom）
packages/muyajs/            # 旧 JS 引擎（退役中，勿新增引用）
packages/website/           # 官网（独立工具链）
CUSTOMIZATIONS/             # 自定义开发内容（规则、账本、代码地图、坑点库、代码、脚本）
├── README.md               # 机制与规则唯一完整版
├── architecture.md         # 代码链路图谱（AI 加速索引）
├── registry.md             # 改动登记账本
├── docs/pitfalls.md        # 历史坑点沉淀
├── release-notes/
├── src/ patches/ scripts/
.agents/skills/             # AI Agent 项目级 skills（3 个）
CLAUDE.md                   # 上游维护的架构文档（勿改）
```

## 文档更新职责（改完代码必须同步）

| 改动类型                       | 更新哪里                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| 任何自定义功能/修改            | `CUSTOMIZATIONS/registry.md`（record-change skill）                 |
| 新增/移动函数、改数据流或接口  | `CUSTOMIZATIONS/architecture.md`（§1 职责表 / §2 反查表 / §3 链路） |
| 解决了一个反复折腾才定位的问题 | `CUSTOMIZATIONS/docs/pitfalls.md`（现象→根因→解法→教训）            |
| 机制/规则变更                  | `CUSTOMIZATIONS/README.md`                                          |

## 代码风格

- 不添加注释（除非用户明确要求）；上游有 `COMMENTING-GUIDELINES`（注释只写代码看不出的约束）
- 遵循现有代码风格（无分号、单引号、2 空格；Vue SFC；renderer 禁 require）
- 提交前运行 `pnpm run lint`
