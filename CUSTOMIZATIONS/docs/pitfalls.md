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
