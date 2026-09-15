# 历史坑点 / Pitfalls

> **这是什么**：本仓库（custom-marktext）开发与排查中**踩过的坑**的沉淀。新会话动手前先扫一眼标题，
> 避免重复踩坑。每条写清：现象 → 根因 → 解法 → 验证方式。
>
> **维护铁律**：每解决一个"反复折腾才定位到"的问题，就来这里加一条（一次没定位到就解决的不算坑）。
> 配套：代码位置反查见 [`../architecture.md`](../architecture.md)。

---

## 1. 上游 `.gitignore` 忽略 `.agents/` —— skill 文件入库需反向豁免

- **日期**：2026-09-04（CUSTOM-20260904-001，初始化时发现）
- **现象**：`.agents/skills/*/SKILL.md` 创建后 `git status` 完全不显示，无法跟踪。
- **根因**：上游 marktext 的 `.gitignore` 含 `.claude/`、`.agents/`、`.agent/` 整目录忽略（上游把 AI 工具目录当本地噪音）；而本仓库的自定义开发体系恰恰要把 `.agents/skills/` 纳入版本管理（跨工具 skill 标准路径）。
- **解法**：在 `.gitignore` 中删除 `.claude/`、`.agents/` 整目录行，改为忽略 `.claude/settings.local.json` + `!.agents/` + `!.agents/**` 反向豁免；`.zcode/plans/` 忽略会话本地计划文档。上游合并时 `.gitignore` 按冲突策略 keep-ours 处理。
- **教训**：基于上游建自定义仓库时，先 `git check-ignore -v` 验证自定义体系目录是否被上游 ignore 规则命中，再批量创建文件。
- **验证**：`git ls-files --others --exclude-standard` 能列出三个 SKILL.md；`git check-ignore .zcode/plans/x.md` 命中。

## 2. native-keymap 编译要求 Spectre 缓解库 —— MSB8040 报错

- **日期**：2026-09-04（CUSTOM-20260904-002，首次 pnpm install 时发现）
- **现象**：`pnpm install` 的 postinstall 在 electron-rebuild 阶段失败：`error MSB8040: 此项目需要缓解了 Spectre 漏洞的库`（native-keymap 的 keymapping.vcxproj）。
- **根因**：native-keymap 的 `binding.gyp` 显式设置 `msvs_configuration_attributes.SpectreMitigation: 'Spectre'`，MSBuild 要求 VS 安装对应工具集/架构的「Spectre 缓解库」组件（MSVC Spectre-mitigated libs）；本机 VS2022 Community 与 BuildTools 都只装了常规库（`MSVC/*/lib/x64/` 下无 spectre 子目录，Windows Kits 也无 spectre 变体）。
- **解法（快速，当前采用）**：改 `node_modules/.pnpm/native-keymap@*/node_modules/native-keymap/binding.gyp` 的 `'SpectreMitigation': 'Spectre'` → `'false'`，再 `pnpm -C packages/desktop exec electron-rebuild -f`（ced/keytar/native-keymap 全部通过）。**该改动在 node_modules 内，`pnpm install` 会重置——重装依赖后需重做**。治本方案（二选一）：① VS Installer → 单个组件 → 勾选「MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated 库」；② 把该 gyp 修改挂成 pnpm patch（packages/desktop/patches/ 已有 native-keymap patch 先例，可扩展）。
- **教训**：Electron 原生模块 gyp 里可能带 `SpectreMitigation` 等额外 MSVC 组件依赖；重装依赖后 rebuild 又报 MSB8040 时，先想起这条——不是 VS 坏了，是组件没装。
- **验证**：`electron-rebuild -f` 输出 `✔ Rebuild Complete`；后续 `build:win:x64` 打包（内含 electron-rebuild）顺利通过。

## 3. Electron GUI 进程在 Git Bash 下没有任何控制台输出——排查启动错误要用 UIA/probe

- **日期**：2026-09-04（CUSTOM-20260904-003，排查打包版启动报错时发现）
- **现象**：`./dist/win-unpacked/marktext.exe`、加 `--enable-logging`、`--log-file`、`MARKTEXT_EXIT_ON_ERROR=1`、重定向 stdout/stderr 到文件——全部拿不到任何输出，甚至挂起 bash 会话；electron-log 的 main.log 也因崩溃发生在 logger 初始化前后而缺失。
- **根因**：Windows GUI 子进程的 stdio 不接到控制台；Git Bash 的管道模式下 Electron 检测到非 TTY 行为异常。错误只呈现在 `dialog.showErrorBox` 的 GUI 弹窗里（标题 "Error"，正文含 stack）。
- **解法（两个有效手段）**：
  1. **UI Automation 读弹窗**：PowerShell 加载 `UIAutomationClient`，从 marktext 主窗口句柄遍历控件树，`Text` 控件的 Name 即错误标题与完整 stack（read-dialog.ps1 脚本已验证）；
  2. **probe 注入**：用 `electron.exe /tmp/mt-probe.js` 先 patch `electron.dialog.showErrorBox`/`showMessageBox` 和 `process.on('uncaughtException')` 落盘到文件，再 require asar 里的 `out/main/index.js`（注意此法 process.resourcesPath 指向 electron.exe 目录，与真实安装不同，只适合看 throw 的 stack）。
- **教训**：Electron 打包版排查不要在控制台输出上浪费时间，直接 UIA 读弹窗最快；`MARKTEXT_EXIT_ON_ERROR` 只对 Accessor 构造期的错误走 console.log，uncaughtException 仍走弹窗。
- **验证**：UIA 一次就拿到了两个错误的完整 stack（preference.json 路径 + ripgrep 缺失）。

## 4. pnpm 隔离布局下 optional 平台包进不了 electron-builder 的 asar（ripgrep 事件）

- **日期**：2026-09-04（CUSTOM-20260904-003，打包版启动报错的第二个根因）
- **现象**：打包版启动即弹 `Uncaught Exception: Could not find @vscode/ripgrep-win32-x64. Ensure optionalDependencies are installed for this platform (win32-x64)`；dev 模式完全正常。
- **根因**：`@vscode/ripgrep` 用 `require.resolve('@vscode/ripgrep-win32-x64/bin/rg.exe')` 找平台二进制。pnpm 的隔离 node_modules 只把**直接依赖**链接到 `packages/desktop/node_modules`；optional 平台包在 `.pnpm/@vscode+ripgrep@x/node_modules/@vscode/` 邻位（Node 的 symlink 解析在 dev 下可达）。electron-builder 打包时只扫描 `packages/desktop/node_modules` 的**物理布局**，收不到 .pnpm 邻位的包 → asar 里没有 ripgrep-win32-x64。
- **解法**：把 `@vscode/ripgrep-win32-x64` 显式加入 `packages/desktop/package.json` 的 `optionalDependencies`（与 native-keymap 并列），pnpm 会在物理布局建立链接，builder 即可收集。非 Windows 平台构建需对应平台包（`-darwin-arm64` 等）。
- **教训**：pnpm + electron-builder + 带 optionalDependencies 平台包的依赖（esbuild/ripgrep/swc 系都有此模式）= 高危组合；打包版启动报 "Could not find xxx" 而在 dev 下正常时，先查 asar：`npx asar list app.asar | grep <pkg>`。
- **验证**：修复后 asar 列表含 `@vscode/ripgrep-win32-x64/bin/rg.exe`（实体在 app.asar.unpacked），应用正常启动。

## 5. electron-builder 命令行 `-C` 指定项目目录无效（monorepo 场景）

- **日期**：2026-09-04（CUSTOM-20260904-002，首次打包时发现）
- **现象**：`npx electron-builder build -C packages/desktop` 直接打印 usage 帮助并报 `Unknown argument: C`，退出失败。
- **根因**：electron-builder CLI（yargs）的项目目录参数是 `--projectDir`/`--project`；`-C` 是 `--config` 的缩写（且此处传了路径值被当作未知参数）。chatbox 单包仓库在根目录跑 builder 无此问题，marktext monorepo 必须显式指定项目目录。
- **解法**：`npx electron-builder build --publish never --win --x64 --projectDir packages\desktop`（配置文件 packages/desktop/electron-builder.yml 随 projectDir 解析，产物按其 `directories.output: ../../dist` 落到仓库根 dist/）。
- **教训**：从单包项目移植打包脚本到 monorepo 时，跨目录调用 builder 用 `--projectDir`；产物名/输出目录以目标包的 electron-builder.yml 为准（本仓库为 `marktext-win-${arch}-${version}-setup.exe`，不是默认 `${productName}-Setup.exe`）。
- **验证**：`build-setup.bat --skip-build` 全流程成功，dist/ 生成 setup.exe + zip + blockmap。

## 6. 保真回放的边界值：0 空行边界与文档尾部空行

- **日期**：2026-09-04（CUSTOM-20260904-005，用户实测反馈暴露）
- **现象**：只改一行的 CRLF 文档保存后出现 7 处空行插入 + 尾部空行丢失（用户 diff 显示多行变更）。
- **根因**：
  1. 回放拼接的块间空行数做了 `Math.max(blanks ?? 1, 1)`——0（块紧贴，如 `### 标题` 后直接跟段落）被强制成 1，凭空插空行；
  2. 文档尾部空行是"块后"信息，marked space token 在最后一个块之后无块可挂载，解析时静默丢弃，序列化固定输出单 `
`。
- **解法**：gap 钳位下限改 0；解析器统计源文本尾部换行数（`getTrailingBlankLines`）→ JSONState 存 → 序列化器 `setTrailingBlankLines` 回放。
- **教训**：
  - 边界值（0、空、尾部）在"记录→回放"机制里最易被默认值吃掉——设计回放 API 时显式区分"未记录（默认 1）"与"记录为 0"；
  - **复现测试必须用原始结构文件**：上一轮验证用了已被上游归一化破坏过一次的文件（标准 1 空行结构），0 空行边界 bug 被掩盖、误判为"用户测旧包"。用户的"修改前备份"才是正确夹具。
- **验证**：preserveZeroGap.spec.ts 7 用例 + 副本真实文件 muya 实例恒等 + 新包 CDP 端到端落盘只变一行。

## 7. 推 tag 会触发上游自带的 release CI 自动构建全平台并覆盖 release 正文

- **日期**：2026-09-04（v0.20.0-custom.1 发布时发现）
- **现象**：推送 tag `v0.20.0-custom.1` 后，本地手动上传的 3 个 Windows 资产之外，release 页面凭空多出 23 个资产（Linux/macOS/Windows 全平台，含 SHA256SUMS.txt）；且 release 正文被覆盖成上游 CI 的通用模板（预发布/未签名 macOS 提示），我们写的详细 release notes 丢失。
- **根因**：上游 marktext 自带 `.github/workflows/release.yml`，`on: push: tags` 触发。它在 GitHub Actions 里全平台构建（约 15 分钟）并 electron-builder `--publish always` 上传到同名 release，同时**用自己的模板重写了 release 正文**。我们上传资产在先、CI 完成在后，未核对最终状态，险些没发现正文被换。
- **解法**（发布流程固定加两步）：
  1. **本地资产与 CI 资产不得混挂**：两者是不同构建（本地 setup.exe 125,436,163 字节 vs CI 125,301,456 字节，SHA-256 必不同）。二选一：
     - A（推荐）：不本地打包传资产，直接用 CI 构建的全平台 23 资产，只需 CI 完成后用我们的 release notes **PATCH release body**；
     - B：完全本地发布——推 tag 前把 release.yml 的 trigger 改为 `workflow_dispatch`（CUSTOM 标记 + registry 登记），本地传资产。
  2. **发完最后一步必做核对**：`GET /repos/zouv/custom-marktext/releases/tags/<tag>` 检查 assets 列表与 body，CI 覆盖正文后需要 PATCH 修正。
  3. **已自动化（2026-09-15 移植 chatbox 方案）**：`node CUSTOMIZATIONS/scripts/publish-release.mjs <tag> --body-only --wait 1800`——等 CI 建好 release 后自动把正文改回 `CUSTOMIZATIONS/release-notes/<tag>.md`，并打印远端资产清单核对；脚本幂等可重跑。本机无 gh CLI 不是障碍：token 从 Git Credential Manager 取（`git credential fill`），不需装 gh、不需登录。
- **教训**：基于上游建自定义仓库时，发布前先看 `.github/workflows/` 有无 `on: push: tags` 的 release 工作流——CI 会"抢发布"（构建、传资产、改正文）。资产大小/哈希核对是发现"同名文件不同构建"的唯一手段；GitHub 首页侧栏不显示 release entry ≠ release 不存在（prerelease 照样不显示，需点进 Releases 页确认）。
- **验证**：`GET /releases/tags/v0.20.0-custom.1` → 23 资产全部 `uploaded`，body 已 PATCH 回我们的完整 release notes。

## 8. `prettier --write` 与 ESLint 的 `space-before-function-paren` 互斥 —— 改上游文件时被静默改写

- **日期**：2026-09-15（发布 v0.20.0-custom.2 前跑 lint 时发现）
- **现象**：`pnpm run lint` 报 5 个 error，全在 `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue`，规则 `@stylistic/space-before-function-paren`（"Missing space before function parentheses"），落在 `constructor(container: ...)` / `_init(url)` / `_updateTransform()` / `_bindEvents()` / `destroy()`。诡异之处：**这些行与上游逐字节相同**，且 v0.20.0-custom.1 就是这样发出去的（上一轮把它当作"既有基线"，stash 对照后放行）。
- **根因**：两条工具链对同一件事要求相反 ——
  1. 本仓库 ESLint 要求函数名与括号间**有空格**（`constructor (`，neostandard 风格）；
  2. 根 `.prettierrc.yaml` 无对应开关，Prettier 固定输出**无空格**（`constructor(`），且 `.prettierignore` 只排除了 `packages/muya/`；
  3. 根 `package.json` 的 lint-staged 钩子顺序是 `["eslint --fix", "prettier --write"]`——**prettier 在后面跑，把 eslint --fix 刚补上的空格又抹掉**。
     CUSTOM-20260904-004 改 editor.vue 时触发了这条链，于是把整个文件的函数声明风格翻了个面（template 属性换行、watch 展开同理）。
- **解法（两步，缺一不可）**：
  1. **先修工具链**（否则下一步立不住）：根 `package.json` 的 lint-staged 把 `packages/desktop/src/**/*.{ts,vue}` 与 `packages/desktop/test/**/*.ts` 的 `prettier --write` 去掉（`eslint --fix` 成为源码唯一格式化者）；`.prettierignore` 加同两个 glob，连同 `pnpm run format` 一起挡住。json/md/yaml 的 prettier 保持不变。
  2. **再修文件**：`git checkout upstream/develop -- <该文件>` 恢复上游版本，按 `[CUSTOM-BEGIN]` 标记把自定义块贴回去。该文件与上游 diff 收敛为仅 3 个标记块。**不要只手工补那几处空格**。
- **踩坑实证（本次真实发生）**：第一次只做了第 2 步、直接提交——**pre-commit 钩子当场把修复抹掉**，5 个 error 原样复现，`git show HEAD:<file>` 里仍是 `constructor(`。凡"改文件内容就能修好"的判断，在这个仓库都要先问一句：谁会再把它改回去？
- **教训**：
  - 改完上游文件后，`git diff upstream/develop -- <file>` **应只剩下 `[CUSTOM-BEGIN]` 块**；出现标记块之外的格式差异就是被 prettier 误伤的信号，当场清掉，否则每轮合并都累积噪声；
  - **修复要落在"下一次由谁改写"这一层**：本仓库源码格式的权威是 ESLint（`@stylistic/*`），Prettier 在源码上是冗余且互斥的，仅保留给 json/md/yaml；
  - `lint.yml` 只在 `pull_request` 触发，custom/main 的提交不受 CI 卡关，这类 error 会静默累积 —— **本地 `pnpm run lint` 是唯一防线**，"上次发布也有"不等于"应该放过"；
  - **提交后要复验产物内容**（`git show HEAD:<file>`），不能只看提交前的 lint 结果——钩子会在提交时改写暂存内容。
- **验证**：修复后 `pnpm run lint` → `0 errors, 149 warnings`（warnings 为上游既有非空断言类提示，不阻塞）；提交后 `git show HEAD:editor.vue` 仍是上游格式、`git diff upstream/develop HEAD -- editor.vue` 仅 3 个 CUSTOM-20260904-004 块。
