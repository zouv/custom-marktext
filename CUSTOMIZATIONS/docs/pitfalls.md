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

## 3. electron-builder 命令行 `-C` 指定项目目录无效（monorepo 场景）

- **日期**：2026-09-04（CUSTOM-20260904-002，首次打包时发现）
- **现象**：`npx electron-builder build -C packages/desktop` 直接打印 usage 帮助并报 `Unknown argument: C`，退出失败。
- **根因**：electron-builder CLI（yargs）的项目目录参数是 `--projectDir`/`--project`；`-C` 是 `--config` 的缩写（且此处传了路径值被当作未知参数）。chatbox 单包仓库在根目录跑 builder 无此问题，marktext monorepo 必须显式指定项目目录。
- **解法**：`npx electron-builder build --publish never --win --x64 --projectDir packages\desktop`（配置文件 packages/desktop/electron-builder.yml 随 projectDir 解析，产物按其 `directories.output: ../../dist` 落到仓库根 dist/）。
- **教训**：从单包项目移植打包脚本到 monorepo 时，跨目录调用 builder 用 `--projectDir`；产物名/输出目录以目标包的 electron-builder.yml 为准（本仓库为 `marktext-win-${arch}-${version}-setup.exe`，不是默认 `${productName}-Setup.exe`）。
- **验证**：`build-setup.bat --skip-build` 全流程成功，dist/ 生成 setup.exe + zip + blockmap。
