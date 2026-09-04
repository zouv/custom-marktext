---
current_upstream_version: "develop@1d3025b2"
current_upstream_commit: "1d3025b2b6306613a6fa0f822ba9bcaf8890b094"
custom_version: ""
last_merge_date: "2026-09-04"
last_release_version: ""
last_release_date: ""
vendor_branch: "vendor/develop"
upstream_remote: "https://github.com/marktext/marktext.git"
---

# MarkText 自定义改动登记

> **本文件是改动登记账本（纯数据）**。机制与规则（冲突策略、标记格式、类型/状态字典、frontmatter 字段职责）见 [`CUSTOMIZATIONS/README.md`](./README.md)。
>
> **两层结构（怎么用）**：
> - **改动总览（按文件）**——查"某个文件现在改了什么、上游合并时怎么处理"：**只读这一节**，每个文件一条，多轮演进已合并为当前状态，无需读历史轮次。
> - **变更日志（按次）**——查"某次改动何时发生、为什么、怎么验证"：按时间倒序的 append-only 流水，只增不改（历史是事实）。
>
> **AI Agent 注意**：
> 1. 开发前读**改动总览**定位相关文件与冲突策略（不必通读变更日志）
> 2. 完成改动后调用 `marktext-record-change` skill：**总览里已有该文件就更新那一节**（合并描述、追加演进链 id），没有就新增一节；变更日志追加一轮记录
> 3. 合并上游时按总览的冲突策略列处理
> 4. 不要删除历史（总览条目整体废弃时标 deprecated，变更日志永不删改）
> 5. 一致性自检：`sh CUSTOMIZATIONS/scripts/check-registry.sh`（代码标记 ↔ 总览表双向比对）

---

## 仓库信息

- **上游仓库**：https://github.com/marktext/marktext
- **当前基于上游版本**：{{current_upstream_version}}
- **当前基于上游 Commit**：{{current_upstream_commit}}
- **当前 Vendor 分支**：{{vendor_branch}}
- **最近一次上游合并**：{{last_merge_date}}
- **最近一次发布版本**：{{last_release_version}} ({{last_release_date}})

---

## 改动总览（按文件）

> **每个文件一条**：该文件当前生效的全部自定义改动（多轮演进已合并）；「标记」列为代码中 `[CUSTOM-BEGIN]` 的 change-id（即该文件自定义区的当前真相），演进链标注历轮 id。代码位置速查见 [`architecture.md`](./architecture.md) §1。
>
> **状态字典**：`active`（生效中）/ `deprecated`（已废弃）/ `merged-upstream`（上游已原生支持）。**冲突策略**字典见 README.md。

| 文件 | 标记（当前） | 演进链 | 当前效果（合并后） | 冲突策略 | 状态 |
|------|-------------|--------|-------------------|---------|------|
| .gitignore | 20260904-001 | 20260904-001 | 上游忽略 `.agents/` 整目录；改为跟踪 `.agents/`（跨工具 skill 标准路径）与 `.claude/settings.local.json`，忽略 `.zcode/plans/` 会话本地文档 | keep-ours | active |
| CUSTOMIZATIONS/（README.md、architecture.md、registry.md、docs/pitfalls.md、scripts/） | （纯自定义目录） | 20260904-001→002 | 自定义机制（规则/账本）+ AI 协作文档（代码地图/坑点库）+ 脚本套件：init-repo/list-custom/sync-vendor/check-registry + manager.sh/build-unpacked.bat/build-setup.bat/7za-shim.*（本地打包，适配 monorepo：electron-builder 用 --projectDir packages\desktop，产物在仓库根 dist/，产物名 marktext-win-x64-<版本>-setup.exe） | keep-ours | active |
| AGENTS.md、.agents/skills/* | （纯自定义文件） | 20260904-001 | 会话级硬约束 + 工作流 + skills（merge-upstream/record-change/release） | keep-ours | active |

---

## 变更日志

### 2026-09-04 - CUSTOM-20260904-002
- **功能**：同步 chatbox 参考项目的本地打包脚本套件并完成首次编译打包（Windows x64）
- **改动文件**：CUSTOMIZATIONS/scripts/manager.sh（新增）、CUSTOMIZATIONS/scripts/build-unpacked.bat（新增）、CUSTOMIZATIONS/scripts/build-setup.bat（新增）、CUSTOMIZATIONS/scripts/7za-shim.cs + 7za-shim.exe（自 chatbox 仓库复制）、CUSTOMIZATIONS/registry.md、CUSTOMIZATIONS/docs/pitfalls.md、CUSTOMIZATIONS/README.md、CUSTOMIZATIONS/architecture.md
- **详细说明**：
  - 脚本套件自 costom-chatbox CUSTOMIZATIONS/scripts/ 移植（manager.sh 统一入口 + build-unpacked.bat/build-setup.bat 分步打包 + 7za-shim 防 winCodeSign 解压中断），按 marktext monorepo 适配差异：① 构建/打包命令改走根 package.json 代理（build:unpack / build:win:x64，含 minify-locales + electron-rebuild）；② electron-builder 配置在 packages/desktop（directories.output=../../dist），故以 `--projectDir packages\desktop` 调用（`-C` 是 yargs 风格缩写会被误认为位置参数，第一次跑失败在 `Unknown argument: C`）；③ 产物名实际为 marktext-win-x64-0.20.0-dev-setup.exe / .zip（electron-builder.yml artifactName 模板），bat 输出提示按此修正；④ 产物目录为仓库根 dist/（chatbox 是 release/build/）；⑤ 7zip-bin 经 builder-util 的 SZA_PATH 传递给 app-builder 解压 .7z 工具缓存，pnpm 隔离布局可能不暴露该路径——脚本对不存在时降级为直接走 builder 自身流程（本机共享缓存 %LOCALAPPDATA%\electron-builder\Cache 已完整，未触发 shim）
  - 安装依赖踩坑（见 pitfalls #2）：pnpm install 的 postinstall 在 electron-rebuild native-keymap 时报 MSB8040（Spectre-mitigated libs required）。本机 VS2022 Community + BuildTools 均未装 MSVC Spectre 组件。解法：改 node_modules 内 native-keymap/binding.gyp 的 `SpectreMitigation: 'Spectre'` → `'false'` 后 electron-rebuild 通过（ced/keytar/native-keymap 全部 Rebuild Complete）。此改动位于 node_modules（git 不跟踪、pnpm install 会重置），治本需 VS Installer 勾选"Spectre 缓解库"组件或长期方案挂 pnpm patch
  - 编译产物：packages/desktop/out/{main,preload,renderer}（27.1s）；打包产物：dist/marktext-win-x64-0.20.0-dev-setup.exe（119MB NSIS）+ .zip（163MB）+ blockmap + latest.yml + dist/win-unpacked/（免安装目录包）
- **验证方式**：`pnpm run build:unpack` 通过；`pnpm run typecheck` 0 错误；`pnpm run lint` 0 errors / 135 warnings（上游既有基线）；`cmd //c build-setup.bat --skip-build` 全流程成功并回显产物；`dist/win-unpacked/marktext.exe` 启动验证（进程正常拉起，10s 后正常终止）；`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿
- **基于上游版本**：develop@1d3025b2

### 2026-09-04 - CUSTOM-20260904-001
- **功能**：初始化 custom-marktext 仓库（自定义开发文档体系建立）
- **改动文件**：.gitignore、CUSTOMIZATIONS/（README.md、architecture.md、registry.md、docs/pitfalls.md、scripts/init-repo.ps1、scripts/list-custom.ps1、scripts/sync-vendor.ps1、scripts/check-registry.sh、src/.gitkeep、patches/.gitkeep）、AGENTS.md、.agents/skills/marktext-record-change/SKILL.md、.agents/skills/marktext-merge-upstream/SKILL.md、.agents/skills/marktext-release/SKILL.md
- **详细说明**：
  - 仓库结构：从本地源仓库 D:\Git\zoss\marktext fetch 对象（develop@1d3025b2 = 2026-09 上游 develop HEAD），配置 origin → zouv/custom-marktext、upstream → marktext/marktext；创建 `vendor/develop`（上游纯净镜像，跟踪 upstream/develop）与 `custom/main`（自定义开发主分支，基于 vendor/develop）。文档体系参考 costom-chatbox 项目的 CUSTOMIZATIONS 机制（一处规则、一处账本、一份代码地图、一份坑点库），适配 marktext 的 pnpm monorepo + develop 分支模型
  - `.gitignore`：上游忽略 `.agents/` 整目录（`.claude/`、`.agent/` 同样），本仓库需要跟踪 `.agents/skills/*`（三个 skill 是跨工具标准路径）。改为仅忽略 `.claude/settings.local.json` 并用 `!.agents/` + `!.agents/**` 反向豁免 `.agents/`；顺带忽略 `.zcode/plans/`（ZCode 会话本地计划文档）
  - 分支模型与 chatbox 参考的差异：marktext 上游 PR 合入 `develop`（非 master），发布走 `release/vX.Y.0` + tag；因此基线 vendor 分支为 `vendor/develop`（commit 跟踪），合并 tag 时可建 `vendor/vX.Y.x` 版本线分支
  - 上游 CLAUDE.md 已含完整架构说明（monorepo 布局、三进程模型、IPC 约定、构建注意事项）；custom-marktext 根 AGENTS.md 引用而不复制它，自定义导航（任务路由/反查表）由 CUSTOMIZATIONS/architecture.md 承担
- **验证方式**：`git log --oneline vendor/develop -1` = 1d3025b2；`git check-ignore` 确认 `.agents/**` 不再被忽略且 `.zcode/plans/` 被忽略；`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿；`git ls-files --others --exclude-standard` 确认三个 SKILL.md / AGENTS.md 可跟踪
- **基于上游版本**：develop@1d3025b2

### _(初始创建)_
- 基于上游 marktext（develop@1d3025b2）创建自定义分支
- 初始化 CUSTOMIZATIONS 目录结构和追踪体系
