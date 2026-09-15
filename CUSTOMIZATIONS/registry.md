---
current_upstream_version: 'develop@1d3025b2'
current_upstream_commit: '1d3025b2b6306613a6fa0f822ba9bcaf8890b094'
custom_version: 'v0.20.0-custom.2'
last_merge_date: '2026-09-04'
last_release_version: 'v0.20.0-custom.2'
last_release_date: '2026-09-15'
vendor_branch: 'vendor/develop'
upstream_remote: 'https://github.com/marktext/marktext.git'
---

# MarkText 自定义改动登记

> **本文件是改动登记账本（纯数据）**。机制与规则（冲突策略、标记格式、类型/状态字典、frontmatter 字段职责）见 [`CUSTOMIZATIONS/README.md`](./README.md)。
>
> **两层结构（怎么用）**：
>
> - **改动总览（按文件）**——查"某个文件现在改了什么、上游合并时怎么处理"：**只读这一节**，每个文件一条，多轮演进已合并为当前状态，无需读历史轮次。
> - **变更日志（按次）**——查"某次改动何时发生、为什么、怎么验证"：按时间倒序的 append-only 流水，只增不改（历史是事实）。
>
> **AI Agent 注意**：
>
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

| 文件                                                                                                            | 标记（当前）                         | 演进链                    | 当前效果（合并后）                                                                                                                                                                                                                                                                                                                                                                                                                                      | 冲突策略                         | 状态   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| .gitignore                                                                                                      | 20260904-001                         | 20260904-001→20260915-006 | 上游忽略 `.agents/` 整目录；改为跟踪 `.agents/`（跨工具 skill 标准路径）与 `.claude/settings.local.json`，忽略会话本地文件 `.zcode/plans/` 与 `.claude/explore-results/`（子代理 transcript）                                                                                                                                                                                                                                                           | keep-ours                        | active |
| .prettierignore                                                                                                 | 20260915-001                         | 20260915-001              | 新增排除 `packages/desktop/src/**/*.{ts,vue}` 与 `packages/desktop/test/**/*.ts`：这些文件由根 ESLint 的 @stylistic/\* 规则管格式，Prettier 的 space-before-function-paren 与之互斥，跑了就把源码改坏（pitfalls #8）；`packages/muya/` 为上游既有条目保留                                                                                                                                                                                               | merge-manual                     | active |
| package.json（根，monorepo 编排器）                                                                             | （无标记，json 无法注释）            | 20260915-001              | lint-staged 的两条 ts/vue 规则去掉 `prettier --write`、只留 `eslint --fix`——原顺序 `["eslint --fix","prettier --write"]` 里 Prettier 在最后跑，必然覆盖 ESLint 刚修好的空格，是"每次提交都弄坏 editor.vue"的直接原因；json/md/yaml 的 prettier 规则不变                                                                                                                                                                                                 | merge-manual                     | active |
| packages/desktop/src/main/globalSetting.ts                                                                      | 20260904-003                         | 20260904-003              | `__static` 路径去掉上游的 `.replace(/\\/g,'\\\\')`（该 replace 在打包后把 Windows 反斜杠路径破坏成字面双反斜杠，preference.json 读取失败弹 Startup error）                                                                                                                                                                                                                                                                                              | merge-manual                     | active |
| packages/desktop/package.json                                                                                   | （无标记，json 无法注释）            | 20260904-003              | optionalDependencies 新增 `@vscode/ripgrep-win32-x64`（pnpm 隔离布局下 optional 平台包不进 packages/desktop/node_modules，electron-builder 收集不到 → 打包版启动报 Could not find @vscode/ripgrep-win32-x64）                                                                                                                                                                                                                                           | merge-manual                     | active |
| pnpm-lock.yaml                                                                                                  | （无标记，lock 随 install 重新生成） | 20260904-003              | 随 optionalDependencies 变更重新生成                                                                                                                                                                                                                                                                                                                                                                                                                    | 接受上游后 pnpm install 重新生成 | active |
| packages/muya/src/state/types.ts                                                                                | 20260904-004                         | 20260904-004              | 各块 state 接口（paragraph/atx/setext/thematic/code/html/blockquote/table/list/math/diagram）加可选 `raw?`/`leadingBlankLines?` 锚点字段（原文回放用，可选不影响现有消费者）                                                                                                                                                                                                                                                                            | merge-manual                     | active |
| packages/muya/src/state/markdownToState.ts                                                                      | 20260904-005                         | 20260904-004→005          | IMarkdownToStateOptions 加 preserveFormatting；preserveFormatting=true 时解析后 `_anchorRawSource` 后处理：重 lex token 流，把 token.raw（去尾空行）与块前空行数 zip 到顶层 state（不侵入各 leaf case）；005 增：记录文档尾部空行数 getTrailingBlankLines()（供序列化回放）                                                                                                                                                                             | merge-manual                     | active |
| packages/muya/src/state/stateToMarkdown.ts                                                                      | 20260904-005                         | 20260904-004→005          | IExportMarkdownOptions 加 preserveFormatting + setParseOptions；顶层块有 raw 锚点时重解析比对（剥锚点字段深比较，缓存去重），一致则原样回放（块间空行数按记录精确回放，含 0 空行紧贴边界），不一致（被编辑）降级走归一化序列化；generate() 按 setTrailingBlankLines 回放文档尾部空行；开关关闭全部短路                                                                                                                                                  | merge-manual                     | active |
| packages/muya/src/state/index.ts                                                                                | 20260904-005                         | 20260904-004→005          | markdownToState()/getMarkdownFromState() 从 muya.options 透传 preserveFormattingOnSave 与解析选项给解析器/序列化器；005 增：解析后存尾部空行数并在序列化时传给生成器                                                                                                                                                                                                                                                                                    | merge-manual                     | active |
| packages/muya/src/types.ts                                                                                      | 20260904-004                         | 20260904-004              | IMuyaOptions 加 preserveFormattingOnSave?（可选字段，不影响现有消费者）                                                                                                                                                                                                                                                                                                                                                                                 | merge-manual                     | active |
| packages/muya/src/config/index.ts                                                                               | 20260904-004                         | 20260904-004              | MUYA_DEFAULT_OPTIONS 加 preserveFormattingOnSave，默认 false（关闭=上游行为逐字节一致）                                                                                                                                                                                                                                                                                                                                                                 | merge-manual                     | active |
| packages/muya/src/state/**tests**/preserveFormatting.spec.ts                                                    | （测试文件，无标记）                 | 20260904-004              | 16 测：往返恒等 12（表格/多空行/tilde/懒引用/嵌套引用/ATX/序号/缩进/组合文档）+ 编辑降级 2 + 开关关闭=上游行为 2                                                                                                                                                                                                                                                                                                                                        | keep-ours                        | active |
| packages/muya/src/state/**tests**/{preserveLiveEdit.spec.ts、preserveRealFile.spec.ts、preserveZeroGap.spec.ts} | （测试文件，无标记）                 | 20260904-005              | 集成层补验：完整 muya 实例 + 真实 content 块 text setter 编辑路径 → 只变被编辑行；用户真实 CRLF 文件（原始 0 空行边界结构副本）全链路恒等（文件缺失静默跳过）；preserveZeroGap 7 用例：0 空行边界/尾部空行数/混合结构/编辑一行恒等                                                                                                                                                                                                                      | keep-ours                        | active |
| packages/desktop/src/main/preferences/schema.json                                                               | （无标记，json 无法注释）            | 20260904-004              | 新键 preserveFormattingOnSave（Markdown 分区，boolean，默认 false）                                                                                                                                                                                                                                                                                                                                                                                     | merge-manual                     | active |
| packages/desktop/static/preference.json、static/locales/{en,zh-CN}.json                                         | （无标记，json 无法注释）            | 20260904-004              | 静态默认值 false；en/zh-CN 文案（其余 9 语言 en 兜底）                                                                                                                                                                                                                                                                                                                                                                                                  | merge-manual                     | active |
| packages/desktop/src/renderer/src/store/preferences.ts                                                          | 20260904-004                         | 20260904-004              | PreferencesState 接口字段 + state 默认值 false                                                                                                                                                                                                                                                                                                                                                                                                          | merge-manual                     | active |
| packages/desktop/src/renderer/src/prefComponents/markdown/index.vue                                             | 20260904-004                         | 20260904-004              | 设置→Markdown→Lists 新增 bool 开关（保存时保留未修改行的原始格式）                                                                                                                                                                                                                                                                                                                                                                                      | merge-manual                     | active |
| packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue                                          | 20260904-004                         | 20260904-004              | muya 初始化 options 加 preserveFormattingOnSave + watch → setOptions（序列化类选项，无需重渲染）；20260915-001 收尾：恢复本文件被 prettier 误伤的上游格式（函数括号空格/template 换行），与上游 diff 收敛为仅 3 个 CUSTOM 块，lint 5 error → 0                                                                                                                                                                                                          | merge-manual                     | active |
| packages/desktop/src/renderer/src/components/sideBar/（currentDir.vue 新增）                                    | （无标记，纯新增文件）               | 20260909-001              | 侧栏「当前目录」面板组件：列当前文件所在目录的 md 文件（readdir + hasMarkdownExtension 过滤 + 排序），点击照抄 treeFile 模式（tabs 查重→UPDATE_CURRENT_FILE 切换 / mt::open-file 新开），current 高亮跟随，watch currentFile.pathname 变化自动重载，含刷新按钮/loading/空目录/untitled/读取失败五种状态文案；v1 拉取式无 watcher                                                                                                                        | keep-ours                        | active |
| packages/desktop/src/renderer/src/components/sideBar/index.vue                                                  | 20260909-001                         | 20260909-001              | 右列面板区加 `currentDir` 第四分支（v-else-if）渲染 currentDir.vue（template + import 两处标记）                                                                                                                                                                                                                                                                                                                                                        | merge-manual                     | active |
| packages/desktop/src/renderer/src/components/sideBar/help.ts                                                    | 20260909-001                         | 20260909-001              | sideBarIcons 数组第 4 项：id `currentDir`、Element Plus Files 图标、i18n `sideBar.icons.currentDir`（点击经现有 handleLeftIconClick → SET_LAYOUT 切面板，无需改 store）                                                                                                                                                                                                                                                                                 | merge-manual                     | active |
| packages/desktop/static/locales/\*.json（11 语言）                                                              | （无标记，json 无法注释）            | 20260909-001              | 新键 sideBar.currentDir.{title,refresh,loading,empty,noDirectory,readError,retry} + sideBar.icons.currentDir；同轮顺带补齐历史欠账：preferences.markdown.lists.preserveFormattingOnSave（004 漏 9 语言）、menu.window.resetZoom（上游 5185 漏 nl），locale parity 测试 35/35 全绿                                                                                                                                                                       | merge-manual                     | active |
| CUSTOMIZATIONS/（README.md、architecture.md、registry.md、docs/pitfalls.md、scripts/）                          | （纯自定义目录）                     | 20260904-001→002          | 自定义机制（规则/账本）+ AI 协作文档（代码地图/坑点库）+ 脚本套件：init-repo/list-custom/sync-vendor/check-registry + manager.sh/build-unpacked.bat/build-setup.bat/7za-shim.\*/publish-release.mjs（本地打包 + 发布到 GitHub：electron-builder 用 --projectDir packages\desktop，产物在仓库根 dist/，产物名 marktext-win-x64-<版本>-setup.exe；publish-release.mjs 从 GCM 取 token 走 REST API，幂等，支持 --body-only --wait 等 CI 抢发布后改回正文） | keep-ours                        | active |
| AGENTS.md、.agents/skills/\*                                                                                    | （纯自定义文件）                     | 20260904-001              | 会话级硬约束 + 工作流 + skills（merge-upstream/record-change/release）                                                                                                                                                                                                                                                                                                                                                                                  | keep-ours                        | active |

---

## 变更日志

### 2026-09-15 - CUSTOM-20260915-006（拆分发布 skill：新增 marktext-publish）

- **功能**：参照 chatbox 的 release/publish 分工，把「发布段」从 marktext-release 拆出为独立的 marktext-publish skill，提高后续发布的效率与可复用性
- **改动文件**：.agents/skills/marktext-publish/SKILL.md（新增）、.agents/skills/marktext-release/SKILL.md（重写为打包 skill）、AGENTS.md（skill 触发表 + 结构速查 3→4）、CUSTOMIZATIONS/README.md（frontmatter 负责方）、CUSTOMIZATIONS/scripts/init-repo.ps1 与 manager.sh（提示文案指向新 skill）、.gitignore（新增忽略 `.claude/explore-results/`）
- **详细说明**：
  - **分工**（对齐 chatbox 的 `chatbox-release` / `chatbox-publish`）：
    - `marktext-release` = 源码 → **本地安装包**（路径 B：版本号、发布前检查、manager.sh 打包、产物版本核验 + 打包类坑点）
    - `marktext-publish` = 版本号 → **GitHub Release 上线**（release notes、registry frontmatter、提交、annotated tag、推送触发 CI、等 CI completed、改回被 CI 覆盖的正文、资产核验 + 发布类坑点）
  - **与 chatbox 的关键差异**（已在 skill 内写明）：marktext 默认走**路径 A**——推 tag 由上游 CI 全平台构建 24 个资产，本地不打包，因此 `marktext-publish` 才是发布的主入口；`marktext-release` 只在路径 B（只要 Windows 包、要完全掌控产物）时先跑
  - 本轮发布踩到的坑全部沉淀进 `marktext-publish` 的「坑点与经验」：管道吃退出码、Windows 测试浮动基线、发布前勿跑完整 `pnpm install`（Spectre）、匿名 API 限流 + 必须等 CI 整体 completed 再改正文、`--prerelease` 要显式传、lint 必须 0 error 且提交钩子会改写暂存内容
  - `marktext-release` 保留打包侧坑点：`-C` 无效（须 `--projectDir`）、产物名以 desktop 包 electron-builder.yml 为准、杀软锁 exe 的 15s 退避、版本号必须在打包前改（内嵌产物名与 exe 资源）
  - 失败处理与回滚表、版本号规范、重要约束按分工重新归位
  - 顺带：`.claude/explore-results/`（Explore 子代理 transcript）被 `git status` 列为未跟踪——`.gitignore` 只忽略 `.claude/settings.local.json`，而 `.claude/` 下目前没有任何被跟踪文件。按「窄口径忽略」加一行 `.claude/explore-results/`，不整目录屏蔽 `.claude/`（以免将来想跟踪项目级配置时被挡住）
- **验证方式**：`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿；新 skill 目录被 git 跟踪（`.agents/` 已由 CUSTOM-20260904-001 反向豁免）
- **基于上游版本**：develop@1d3025b2

### 2026-09-15 - CUSTOM-20260915-005（gh CLI 接入 + 仓库解析陷阱）

- **功能**：gh CLI 安装登录后的使用规范；修掉一个「gh 命令会打到上游仓库」的严重陷阱
- **改动文件**：.agents/skills/marktext-release/SKILL.md（「GitHub 认证」章节改写为双路说明）；本地 git 配置 `remote.origin.gh-resolved=base`（只写 .git/config，不随仓库分发，无需提交）
- **详细说明**：
  - gh 已安装（winget，2.100.0，位于 `C:\Program Files\GitHub CLI`）并完成 `gh auth login`（账号 zouv，凭据存 keyring，scopes: gist / read:org / repo / workflow）。**不在 PATH 里**，用前需 `export PATH="$PATH:/c/Program Files/GitHub CLI"`
  - **陷阱**：本仓库有 `origin`(zouv/custom-marktext) 与 `upstream`(marktext/marktext) 两个 remote，gh 解析到的是 **marktext/marktext（上游）**——不加 `--repo` 的 gh 命令会操作上游仓库（`gh release list` 列出的是上游的 release 即为实证）。修复：`git config remote.origin.gh-resolved base`
  - 分工：**自动化发布仍走 GCM token**（`publish-release.mjs`，不依赖 gh 是否登录、也不受上述陷阱影响）；**人工排查走 gh**，且先用 `gh repo view --json nameWithOwner` 确认仓库
  - `gh auth setup-git` 已执行，git push 也可走 gh 凭据
- **验证方式**：设置 gh-resolved 后 `gh repo view --json nameWithOwner` → `zouv/custom-marktext`；`gh release view v0.20.0-custom.2` 正常返回（24 资产全部 uploaded / draft=false / prerelease=true / 正文为本版 notes）
- **基于上游版本**：develop@1d3025b2

### 2026-09-15 - CUSTOM-20260915-004（v0.20.0-custom.2 发布结果核对）

- **功能**：记录 v0.20.0-custom.2 的实际发布结果与操作教训
- **改动文件**：CUSTOMIZATIONS/registry.md、.agents/skills/marktext-release/SKILL.md（无代码改动）
- **详细说明**：
  - 结果：release id=388829901，`draft=false` / `prerelease=true`，**24 个资产全部 uploaded**，正文已用我们的 release notes 覆盖
  - 资产与 v0.20.0-custom.1 同构：Windows x64/arm64（setup.exe + zip + blockmap）、macOS x64/arm64（dmg + zip + blockmap）、Linux（AppImage/deb/rpm/snap/tar.gz）、latest\*.yml、builder-debug.yml、SHA256SUMS.txt
  - `--body-only` 必须配 `--prerelease`：脚本 PATCH 会一并更新 `prerelease` 字段，漏传会把 CI 设好的预发布标记改成 `false`
  - 教训：匿名轮询 GitHub API 会撞 60 次/小时限流（本次约 20 分钟耗尽，之后持续报 parse-error，差点误判成 CI 卡住）；且 `--body-only` 必须等 **CI 工作流整体 completed** 后再跑——CI 是「先建 draft 写模板正文 → 再提升 published」，中途 PATCH 有被覆盖风险。两条已写入 release skill 坑点 #4
- **验证方式**：`GET /releases/tags/v0.20.0-custom.2` → 24/24 资产 `uploaded`、`prerelease=true`；正文前 6 行与 `CUSTOMIZATIONS/release-notes/v0.20.0-custom.2.md` 一致、含「侧栏第四面板」等本版特征串
- **基于上游版本**：develop@1d3025b2

### 2026-09-15 - CUSTOM-20260915-003（发布 v0.20.0-custom.2）

- **功能**：发布 v0.20.0-custom.2（GitHub Release 预发布）
- **改动文件**：packages/desktop/package.json（version 0.20.0-custom.1 → 0.20.0-custom.2）、CUSTOMIZATIONS/registry.md（frontmatter）、CUSTOMIZATIONS/release-notes/v0.20.0-custom.2.md（新增）
- **详细说明**：
  - 基线仍为 develop@1d3025b2（非正式 tag）→ 按规范标 prerelease
  - **发布路径改为「CI 全平台构建」（pitfalls #7 方案 A）**：推 tag 触发上游 release.yml，产出 24 个资产（Windows x64/arm64、macOS x64/arm64、Linux 五种包型 + latest\*.yml + SHA256SUMS.txt）；本地不打包，省去百兆产物上传
  - CI 会用自带模板覆盖 release 正文 → 构建完成后用 `publish-release.mjs --body-only --wait` 改回我们的 notes
- **验证方式**：发布前 `lint` 0 error / `typecheck` 0 错误 / `build:unpack` 通过（`test` 11 个失败为 Windows 环境基线，已在 release notes 如实标注）；推送后按第七步核对 CI 资产清单与正文
- **基于上游版本**：develop@1d3025b2

### 2026-09-15 - CUSTOM-20260915-002（发布工具 publish-release.mjs）

- **功能**：移植 chatbox 的发布脚本，解决「本机无 gh CLI」与「CI 抢发布并覆盖正文」两个问题
- **改动文件**：CUSTOMIZATIONS/scripts/publish-release.mjs（新增）、.agents/skills/marktext-release/SKILL.md、CUSTOMIZATIONS/architecture.md（§2.9）、CUSTOMIZATIONS/docs/pitfalls.md（#7 补第 3 条）
- **详细说明**：
  - token 从 Git Credential Manager 取（`git credential fill`，只在运行时读取、不落盘、不回显）——**不再需要安装 gh CLI 或 gh auth login**；skill 里「gh 不可用时提示用户安装」的旧指引已作废并改写
  - 幂等：release 已存在则复用 + 覆盖正文，同名资产先删后传，上传后校验远端字节数
  - `--body-only --wait N`：等 CI 创建 release 后把正文改回 `CUSTOMIZATIONS/release-notes/<tag>.md`，并打印远端资产清单核对（pitfalls #7 方案 A 的自动化）
  - `--asset`（可重复）保留本地打包上传路径（方案 B）
  - 顺带把 chatbox 的三条操作经验写进 skill「坑点与经验」：管道吃退出码（本次真实踩到，`| tail` 让 11 个测试失败被误报为通过）、Windows 测试浮动基线、发布前勿跑 pnpm install（Spectre 坑 pitfalls #2）
  - 顺带修复既有问题：总览把 `packages/muya/src/types.ts` 与 `packages/muya/src/config/index.ts` 写在同一个单元格，`check-registry.sh` 的 `、` 拆分未生效 → 自检**长期 3 处不一致**（已在 HEAD 上对照复现，非本次引入）。按 README「总览按文件、一文件一行」的设计拆成两行后自检恢复全绿
- **验证方式**：`--dry-run` 前置校验通过；v0.20.0-custom.2 发布实跑 `--body-only --wait` 成功改回正文
- **基于上游版本**：develop@1d3025b2

### 2026-09-15 - CUSTOM-20260915-001（修复 Prettier/ESLint 格式冲突，lint 归零）

- **功能**：修复发布前发现的 5 个 lint error，并从工具链层面根治（否则每次提交都会重新弄坏）
- **改动文件**：根 `package.json`（lint-staged，无标记：json 无法注释）、`.prettierignore`、packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue（恢复上游格式、保留 CUSTOM 块）、CUSTOMIZATIONS/docs/pitfalls.md（新增 #8）
- **详细说明**：
  - 根因：ESLint 要求 `constructor (`（括号前有空格，全仓库仅 editor.vue 违规 ⇒ 空格风格才是事实标准），Prettier 固定输出 `constructor(`；而根 package.json 的 lint-staged 顺序是 `eslint --fix` 在前、`prettier --write` 在后——**Prettier 跑在最后，必然覆盖 ESLint 刚修好的空格**
  - **处置分两步（只改文件内容是不够的）**：
    1. 工具链：lint-staged 的 `packages/desktop/src/**/*.{ts,vue}` 与 `packages/desktop/test/**/*.ts` 去掉 `prettier --write`（eslint --fix 成为源码唯一格式化者）；`.prettierignore` 加同两个 glob，连同 `pnpm run format` 一并挡住（json/md/yaml 的 prettier 保持不变）
    2. 文件：`git checkout upstream/develop -- <file>` 恢复上游版本，再按 `[CUSTOM-BEGIN]` 标记重贴自定义块；**不做逐处补空格**
  - **踩空记录**：第一次只改了文件内容就提交，pre-commit 钩子当场把修复抹掉、5 个 error 原样复现——这条正是"文件级修复立不住"的实证，故必须连工具链一起改
  - **修正上一轮的误判**：CUSTOM-20260909-001 的验证记录把 editor.vue 的 5 个 error 当作「上游既有基线」放行，实际是自定义提交引入的（`git diff upstream/develop` 显示该文件已被 prettier 改写），已写入 pitfalls #8 存档
- **验证方式**：`pnpm run lint` → 0 errors / 149 warnings；提交后再核验 `git show HEAD:<file>` 内容与 `git diff upstream/develop HEAD -- editor.vue` 仅 3 个 CUSTOM-20260904-004 块（确保钩子没再改写）
- **基于上游版本**：develop@1d3025b2

### 2026-09-09 - CUSTOM-20260909-001

- **功能**：侧栏第四面板「当前目录」——快速浏览/切换当前打开文件所在目录的 Markdown 文件，无需 Open Folder 打开整个项目树
- **改动文件**：packages/desktop/src/renderer/src/components/sideBar/currentDir.vue（新增）、packages/desktop/src/renderer/src/components/sideBar/index.vue、packages/desktop/src/renderer/src/components/sideBar/help.ts、packages/desktop/static/locales/\*.json（11 语言）、CUSTOMIZATIONS/{registry.md、architecture.md}
- **详细说明**：
  - 方案（用户选定 A）：rightColumn 加第四个值 `currentDir`，与现有 files/search/toc 三面板同构（上游合并冲突面最小）；数据全部复用现有原语零新增 IPC：`window.fileUtils.readdir` + `hasMarkdownExtension`（preload 同步谓词）+ `window.path.dirname/basename/join`（pathe）
  - 点击打开照抄 treeFile.vue 模式：先在 tabs 里 `isSamePathSync` 查重（命中→`UPDATE_CURRENT_FILE` 切 tab 不新开），未命中→`send('mt::open-file')` 走 main 完整链路
  - 刷新策略 v1 拉取式：watch `currentFile.pathname` 的 dirname 变化自动重载 + 手动刷新按钮；不为单目录面板挂 chokidar（上游 watcher 生命周期绑定 windowManager，代价不值，实时性需求出现再做 v2）
  - 组件作为上游不存在的全新文件放 `sideBar/` 目录（对上游是 untracked 路径，合并零冲突，策略 keep-ours；与 004 的测试文件放置先例一致）
  - 顺带清两笔历史欠账（parity 测试强制 11 语言键一致，004 当时漏补未被发现）：`preferences.markdown.lists.preserveFormattingOnSave` 补 9 语言、`menu.window.resetZoom` 补 nl（上游 #5185 漏）
- **验证方式**：`pnpm run typecheck` 0 错误；`pnpm run lint` 新文件 0 错误（上游 editor.vue 5 个既有 error 为基线，stash 对照确认）；`pnpm run test` locale-validation 35/35 全绿（欠账清后从 9 failed → 0），move-image 7 失败 + pdf 3 失败为既有基线（stash 前后失败集完全一致）；`build:unpack` + manager.sh unpacked 重打包后 CDP 端到端实测：4 图标出现→点击激活面板→列出 a/b/c.md（a.md current 高亮、tooltip 路径正确）→点 b.md 新开 tab 并切换（高亮转移）→点 c.md 同→回点 a.md 查重切回不新开→刷新按钮正常→新窗口 Untitled-1 面板显示"Save the file to view its directory."空态；`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿
- **基于上游版本**：develop@1d3025b2

### 2026-09-04 - CUSTOM-20260904-006（发布 v0.20.0-custom.1）

- **功能**：发布 v0.20.0-custom.1（首个自定义版本，GitHub Release 预发布）
- **改动文件**：packages/desktop/package.json（version 0.20.0-dev → 0.20.0-custom.1）、CUSTOMIZATIONS/registry.md（frontmatter）、CUSTOMIZATIONS/release-notes/v0.20.0-custom.1.md（新增）
- **详细说明**：
  - 基线 develop@1d3025b2（上游 0.20.0 开发线，非正式 tag）→ 按规范标记 prerelease
  - 产物：marktext-win-x64-0.20.0-custom.1-setup.exe（NSIS 120MB）+ .zip（165MB）+ blockmap；asar 已验证含 005 修复（8 处 CUSTOM-20260904-005 标记）
  - gh CLI 本机不可用 → 用 git credential 的 token 走 GitHub REST API 创建 Release 并上传产物
  - 顺带登记：提交规则调整（AGENTS.md 禁止未经用户指示 commit/push；record-change 第六步改为汇报不自动提交；merge/release skill 加流程内提交的约束说明）——8143487a
- **验证方式**：产物 asar 标记检查通过；Release 创建后 API 校验资产列表与大小
- **基于上游版本**：develop@1d3025b2

### 2026-09-04 - CUSTOM-20260904-005

- **功能**：修复保真回放的两个边界 bug（用户实测反馈：AGENTS.md 只改一行仍多处变更）
- **改动文件**：packages/muya/src/state/{markdownToState.ts、stateToMarkdown.ts、index.ts}、packages/muya/src/state/**tests**/{preserveZeroGap.spec.ts（新增）、preserveRealFile.spec.ts、preserveLiveEdit.spec.ts}、CUSTOMIZATIONS/registry.md
- **详细说明**：
  - 用户场景：CRLF 的 AGENTS.md（结构特点：多处 0 空行块边界——### 标题后紧贴段落、段落后紧贴列表；文档尾部 1 个空行），只改第一行标题，保存后 7 处插入空行 + 尾部空行丢失
  - 根因 1（0 空行边界）：回放拼接时空行 gap 用 `Math.max(blanks ?? 1, 1)` 把记录的 0（紧贴）强制钳到 1，相当于给所有紧贴边界插入一个原文没有的空行。修复：钳位下限改为 0（`Math.max(blanks ?? 1, 0)`），未记录时默认 1 不变
  - 根因 2（尾部空行）：文档末尾空行属于"块间"信息但出现在最后一个块之后，marked 的 space token 在解析时被丢弃（无块可挂载）。修复：MarkdownToState 在 `_anchorRawSource` 末尾从源文本统计尾部换行数记为 `_trailingBlankLines`（getTrailingBlankLines() 暴露）；JSONState.markdownToState 解析后存入自身字段；getMarkdownFromState 序列化前 setTrailingBlankLines 传给 ExportMarkdown；generate() 末尾把输出尾部归一为 (记录值+1) 个换行
  - 复现与验证闭环：先用副本文件（用户提供的修改前备份）在 MarkdownToState/ExportMarkdown 直连层复现（21 行差异 → 修 1 后剩 1 行尾部差异 → 修 2 后恒等）；再在新打的 win-unpacked 包上用 CDP 端到端复刻用户操作（打开副本 → 真实编辑第一行 '重要'→'重a要' → FILE_SAVE 真实 IPC 落盘）→ 落盘 diff 确认只有第一行变化
  - 上轮误判说明：上轮结论"旧包误测"不完全对——当时 CDP 测试用的 AGENTS.md 是已被上游归一化破坏过一次的文件（结构已被改写为标准 1 空行边界），掩盖了 0 空行边界 bug；本轮用原始结构副本才暴露。教训已回写 pitfalls
- **验证方式**：preserveZeroGap.spec.ts 7 用例（0 空行紧贴标题/段落列表紧贴/用户文档混合结构/尾部 0·1·多空行/编辑一行恒等）；preserveRealFile.spec.ts 改用副本文件（原始结构）恒等；muya 全套 1489/1489 全过；`pnpm -C packages/muya lint` 0 errors、`lint:types` 0 错误；`pnpm run build:unpack` + unpacked 重打包；新包 CDP 端到端落盘 diff 只变一行；`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿；Setup 包已重打（dist/marktext-win-x64-0.20.0-dev-setup.exe，21:54）
- **基于上游版本**：develop@1d3025b2

### 2026-09-04 - CUSTOM-20260904-004

- **功能**：实现"保存时未修改的行保持原样"（改哪行变哪行）+ 新增偏好开关 preserveFormattingOnSave（默认关=上游行为）
- **改动文件**：packages/muya/src/state/{types.ts、markdownToState.ts、stateToMarkdown.ts、index.ts、**tests**/preserveFormatting.spec.ts}、packages/muya/src/{types.ts、config/index.ts}、packages/desktop/src/main/preferences/schema.json、packages/desktop/static/preference.json、packages/desktop/static/locales/{en,zh-CN}.json、packages/desktop/src/renderer/src/store/preferences.ts、packages/desktop/src/renderer/src/prefComponents/markdown/index.vue、packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue、CUSTOMIZATIONS/{registry.md、architecture.md}
- **详细说明**：
  - 动机：WYSIWYG 模式保存的文档是 muya 全量重序列化产物（markdownToState→stateToMarkdown 非恒等），未改动的行会被归一化改写（表格列宽重排/多空行折叠/~~~→```/引用补>/ATX 去关闭式等 10 项，实测 32 样本 10 非恒等）
  - 实现（原文回放）：① 解析侧 markdownToState 增 preserveFormatting 选项，解析后 `_anchorRawSource` 后处理把 token.raw（去尾空行）与块前空行数 zip 到顶层 state 的可选字段 raw/leadingBlankLines（不侵入各 leaf case，只标顶层块；嵌套块由顶层祖先整体回放覆盖）② 序列化侧 stateToMarkdown 增 preserveFormatting + setParseOptions，顶层块有 raw 时重解析 raw 并与当前 state 深比较（剥锚点字段；重解析结果缓存 Map 去重），一致则原样回放（块前空行数按记录回放，默认 1），不一致（被用户编辑）自动降级走归一化序列化 ③ 机制保证：muya 编辑走 ot-json1 op（jsonState.editOperation(path, diff)），op 只触达目标块的 text/局部字段，未改块的 raw 锚点天然保留 ④ 选项透传：IMuyaOptions.preserveFormattingOnSave → JSONState.markdownToState/getMarkdownFromState → MarkdownToState/StateToMarkdown ⑤ desktop 偏好开关全链路（schema/store/pref UI/editor options+watch/preference.json/locales），默认 false
  - 决策依据：评估过三方案——A 序列化器保真（选定，原文回放是其落地形态）、B diff 式保存（需 muya 核心+desktop 保存管线双改、基线生命周期复杂、上游冲突面大，弃）、C 开关壳（并入 A 实现）。改动集中在 muya state 3 文件 + 可选字段/条件分支模式（fenceLength 先例），关闭时全链路短路=上游行为逐字节一致
  - 注意：回放只作用于顶层块；raw 重解析出多块或无 setParseOptions 时不回放（安全兜底）；偏好切换无需重渲染（序列化时读 muya.options 即时生效）
- **验证方式**：`pnpm -C packages/muya exec vitest run src/state/__tests__/preserveFormatting.spec.ts` 16 测全过（往返恒等 12/编辑降级 2/开关关闭=上游行为 2）；muya 全套 1477/1478 过（唯一失败 tableChessboard "is exported from entrypoint" 为负载型 flaky——该测试导入全包入口约 4.5s 贴近 5s 超时，干净树同样偶发，与本改动无关）；`pnpm run typecheck` 0 错误；`pnpm -C packages/muya lint` 0 errors（9 warnings 为既有基线+complexity 提示）；根 `pnpm run lint` 0 errors；`pnpm run build:unpack` 通过；`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿
- **用户反馈复测（首次报告"仍改到其他行"）**：定位为旧包误测（用户测的 15:33 构建包，特性 19:00 才实现）。补两层验证后确认功能正常：① 新增 `preserveLiveEdit.spec.ts`（3 测：完整 muya 实例 + 真实 content 块 text setter 编辑路径 + flush → getMarkdown 只变被编辑行；锚点写入 live state；开关关闭无锚点）与 `preserveRealFile.spec.ts`（1 测：用户真实 CRLF 文件全链路恒等，文件缺失时静默跳过）② 打包版 CDP 实测：`--remote-debugging-port` 启动 → `window.__probeMuya`（经 `.mu-editor` DOM expando `__MUYA_BLOCK__.muya` 定位）→ 真实编辑第一行 heading → `getMarkdown()` 输出与"只改一行"期望恒等 → 调 pinia editor store 的 `FILE_SAVE()` 触发真实保存 → 落盘文件 diff 确认只有第一行变化。期间确认 tab.markdown、writeMarkdownFile 的 CRLF 回写（adjustLineEndingOnSave）均正常。已重打 Setup 包（dist/marktext-win-x64-0.20.0-dev-setup.exe）
- **基于上游版本**：develop@1d3025b2

### 2026-09-04 - CUSTOM-20260904-003

- **功能**：修复打包版启动报错（Error 对话框：Startup error + ripgrep 模块缺失）——两个上游 bug，均只在 Windows 打包版触发
- **改动文件**：packages/desktop/src/main/globalSetting.ts、packages/desktop/package.json、pnpm-lock.yaml、CUSTOMIZATIONS/registry.md、CUSTOMIZATIONS/docs/pitfalls.md、CUSTOMIZATIONS/architecture.md
- **详细说明**：
  - 错误 1（Startup error: Can not load static preference.json file）：`globalSetting.ts` 把 `__static` 路径做了 `.replace(/\\/g, '\\\\')`（单反斜杠→双反斜杠）。dev 下 `app.getAppPath()` 返回正斜杠路径不命中该 replace 所以无恙；打包后 `process.resourcesPath` 返回反斜杠路径，replace 后变成字面 `C:\\...\\resources\\static`，`fs.readFileSync` 找不到 preference.json，Accessor 构造抛错弹窗。修复：去掉 replace（path.join 结果本就是合法路径）
  - 错误 2（Uncaught Exception: Could not find @vscode/ripgrep-win32-x64）：`@vscode/ripgrep` 的 ESM 入口 `require.resolve('@vscode/ripgrep-win32-x64/bin/rg.exe')`。pnpm 隔离布局下该 optional 平台包只存在于 `.pnpm` 虚拟 store 邻位，不会链接到 `packages/desktop/node_modules`（dev 下 Node 经 symlink 解析能找到；electron-builder 只扫物理布局收不到）→ asar 里没有该包，主进程加载即崩。修复：把 `@vscode/ripgrep-win32-x64` 显式加进 `packages/desktop` 的 optionalDependencies，让 pnpm 在 `packages/desktop/node_modules/@vscode/` 建立链接，builder 即可收集。副作用：打非 Windows 平台需要对应平台包（上游 lock 里 optional 标记会自动按平台过滤，跨平台构建时按需加对应条目）
  - 排查手段沉淀（见 pitfalls #3）：Electron GUI 进程在 Git Bash 下 stdout/stderr 不可见（管道会挂起进程），`--enable-logging`/`--log-file`/重定向全无效；有效方法是 UI Automation 读 Error 对话框文本，或在加载 main bundle 前 patch `dialog.showErrorBox`/`uncaughtException` 落盘的 probe 脚本
- **验证方式**：`pnpm run build:unpack` + `build-setup.bat` 全流程通过；UIA 读取窗口树确认主窗口 `Untitled-1`（编辑器正常打开，非 Error）；asar list 确认 `node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe` 已入包（rg.exe 实体在 app.asar.unpacked）；`sh CUSTOMIZATIONS/scripts/check-registry.sh` 全绿
- **基于上游版本**：develop@1d3025b2

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
