# Development Rules

> 本文件分两部分：**第一部分**是本仓库（custom-marktext）的会话级硬约束与自定义开发规则，必须遵守；**第二部分**是上游 marktext 的架构与开发说明，随上游合并更新，**不要按自定义需求改写**。

---

# 第一部分：custom-marktext 自定义开发规则

## 重要

每次回复开头都要先喊一声"啊唯"

## 项目概述

本项目是基于 marktext/marktext 的自定义二次开发版本（custom-marktext）。AI Agent 在本仓库工作时，必须严格遵循以下规则。

## 必读文件（开始任何任务前）

1. **CUSTOMIZATIONS/README.md**——自定义开发机制的完整规则（冲突策略、标记格式、frontmatter 职责）
2. **CUSTOMIZATIONS/registry.md**——自定义改动登记账本（开发前读「改动总览」节）
3. **本文件「第二部分」**——上游维护的架构说明（monorepo 布局、三进程模型、构建注意事项；勿修改）

## 工作流（写代码 / 排查问题前）

1. **先读 `CUSTOMIZATIONS/architecture.md`**：按 §0.5 任务作用域路由表确定该读哪些文件、忽略哪些；按 §2 任务→代码位置表定位。改 muya 前先读 `packages/muya/AGENTS.md`。图谱过期时以代码为准并顺手订正。
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
| `vendor/develop`   | 上游版本基线（上游 develop 线）               | 只读（仅 merge-upstream skill 可更新） |
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

| Skill                     | 何时调用                                                                |
| ------------------------- | ----------------------------------------------------------------------- |
| `marktext-record-change`  | 完成任何自定义功能/修改后                                               |
| `marktext-merge-upstream` | 用户要求合并上游/升级版本/同步原仓库时                                  |
| `marktext-release`        | 用户要求打包/生成安装包/build 时（本地打包，路径 B）                    |
| `marktext-publish`        | 用户要求发布/上传 release/打 tag/推 release 到 GitHub 时（路径 A 默认） |

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
.agents/skills/             # AI Agent 项目级 skills（4 个）
CLAUDE.md                   # 一行指路文件（@AGENTS.md），供 Claude Code 自动加载本文件
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

---

# 第二部分：上游架构与开发说明（marktext upstream）

## Project Overview

MarkText is a WYSIWYG markdown editor built on Electron + Vue 3. It supports CommonMark, GitHub Flavored Markdown, math (KaTeX), Mermaid diagrams, PlantUML, and multiple editing modes (focus, typewriter, source-code).

- **Version**: see `package.json`
- **License**: MIT
- **Repository**: <https://github.com/marktext/marktext>

## Tech Stack

| Layer              | Technology                                                                           |
| ------------------ | ------------------------------------------------------------------------------------ |
| Language           | TypeScript 5.9 (strict mode) — `packages/muyajs/` is legacy JS, no longer referenced |
| Desktop shell      | Electron 42                                                                          |
| Build system       | electron-vite 5                                                                      |
| Packaging          | electron-builder 26                                                                  |
| Frontend framework | Vue 3                                                                                |
| State management   | Pinia 3                                                                              |
| Routing            | Vue Router 4                                                                         |
| UI library         | Element Plus                                                                         |
| Unit tests         | Vitest 4                                                                             |
| E2E tests          | Playwright                                                                           |
| Package manager    | pnpm >=10 workspace (`packageManager: pnpm@10.33.4`)                                 |
| Repo layout        | pnpm monorepo — see Directory Structure                                              |
| Node.js minimum    | >=20.19.0 (PR CI: Node 22.21.1 · release CI: Node 24.14.1)                           |

## Directory Structure

This is a pnpm workspace. Three packages live under `packages/`, and the
root holds only shared tooling and CI-facing scripts.

```
<repo-root>/
  package.json              Workspace orchestrator — every CI-facing script
                            proxies to packages/desktop via `pnpm --filter
                            marktext ...`. CI invocations are unchanged.
  pnpm-workspace.yaml       `packages: ['packages/*']` plus allowBuilds.
  pnpm-lock.yaml            Single lockfile, shared across all packages.
  eslint.config.js          Root ESLint v9 flat config (covers desktop +
                            muyajs; website has its own ESLint v8 config
                            and is ignored here).
  scripts/                  Workspace-level scripts. postinstall.ts,
                            minify-locales.ts, generateThirdPartyLicense.ts,
                            validateLicenses.ts, thirdPartyChecker.ts all
                            target packages/desktop internally.
  docs/                     Long-form developer docs.
  dist/                     Packaged installers from electron-builder
                            (git-ignored; electron-builder writes here via
                            `directories.output: ../../dist` so CI artifact
                            globs `dist/*` still apply).
  packages/
    desktop/                The Electron app (name: "marktext").
      package.json          Holds all Electron / Vue / build-time deps and
                            the dev/build/test/typecheck scripts. Depends on
                            @muyajs/core via workspace:*.
      electron.vite.config.ts
      electron-builder.yml  directories.output points at ../../dist.
      tsconfig.json / tsconfig.base.json
      vitest.config.ts
      playwright.config.ts  Must stay here, not in test/e2e/ — Playwright only
                            auto-loads a config from the directory it runs in.
      patches/              pnpm patches consumed by patch-package.
      build/                electron-builder resources (icons, entitlements,
                            NSIS scripts).
      static/               Static assets bundled into the app
                            (icons, themes, locales).
      out/                  electron-vite output (git-ignored).
      test/
        unit/               Vitest specs → pnpm test / pnpm test:unit
        e2e/                Playwright specs → pnpm test:e2e
      src/
        common/             Pure Node.js utilities usable from main, preload,
                            and renderer.
        main/               Electron main process (IO, native dialogs, window
                            management, auto-updater).
        preload/            Electron preload scripts. The renderer runs
                            sandboxed (contextIsolation: true,
                            nodeIntegration: false, sandbox: true since
                            #4244) — all Node access flows through the typed
                            contextBridge surface in
                            packages/desktop/src/preload/index.ts.
        renderer/           Vue 3 application (editor UI, Pinia stores).
          src/
            components/     Vue single-file components.
            store/          Pinia stores (editor.ts, preferences.ts,
                            layout.ts, …).
            pages/          Top-level Vue pages / routes.
            router/         Vue Router configuration.
        shared/             Cross-process types (`shared/types/`) and the
                            IPC contract (`shared/types/ipc.ts`).
        types/              Ambient .d.ts declarations.
    muyajs/                 Legacy markdown editor engine
                            (name: "@marktext/muyajs"). Primarily JS + DOM,
                            avoids Electron APIs. Exception:
                            packages/muyajs/lib/parser/render/plantuml.js
                            imports Node's `zlib`. Nothing imports it any
                            more — the desktop renderer consumes
                            @muyajs/core (packages/muya), and the `muya/*`
                            alias, the `src/types/muya.d.ts` bridge and the
                            workspace dep are gone (#4257). The package
                            itself is deleted post-0.20.0.
      lib/
        contentState/       Block structure and document transformations.
        parser/             Markdown parser.
        renderers/          WYSIWYG renderer.
        ui/                 Inline toolbar, emoji picker, etc.
        utils/              Internal utilities.
      themes/               Editor themes (Prism + fonts).
    muya/                   TypeScript rewrite of muya
                            (name: "@muyajs/core"; upstream:
                            https://github.com/marktext/muya). Built on
                            ot-json1 + ot-text-unicode + snabbdom + marked@16
                            + rxjs. Self-contained: own eslint config
                            (antfu), own stylelint, own madge, own vitest
                            spec suites (CommonMark + GFM). The editor
                            engine the desktop renderer consumes. See
                            packages/muya/AGENTS.md for layout and commands.
      src/                  TS source. Public entrypoint src/index.ts.
      test/spec/            CommonMark 0.31 + GFM 0.29-gfm conformance.
      examples/             muya-examples — vite vanilla-TS dev demo
                            (listed in pnpm-workspace.yaml).
      e2e/                  muya-e2e — Playwright suite. CI runs Chromium
                            only via muya-e2e.yml; Firefox + WebKit are
                            wired in playwright.config.ts but deferred
                            until BACKLOG Phase 3 lands engine-independent
                            specs.
    website/                marktext-website (Vite + React 18). Standalone
                            toolchain; depends on @muyajs/core from npm,
                            not on the local muyajs package. Not part of
                            desktop CI today.
      src/ / public/ / build/ / vite.config.ts / tsconfig.json
```

The root has no `src/`, `test/`, `static/`, or `build/` of its own anymore — they all live in `packages/desktop/`.

## Development Workflow

All commands run from the repo root. The root `package.json` proxies every
desktop-specific script to `packages/desktop` via `pnpm --filter marktext`,
so the names and behavior are unchanged from the pre-monorepo layout.

```bash
# Install dependencies (runs scripts/postinstall.ts automatically — patches
# native-keymap, downloads Electron, rebuilds native modules, minifies locales)
pnpm install

# Run in development mode
# Renderer hot-reloads automatically. Pressing Ctrl+R in the dev window reloads
# the renderer (which re-runs the preload script); changes to the main process
# require restarting `pnpm run dev`.
pnpm run dev

# Preview the last electron-vite build (no rebuild).
pnpm run start

# Build without packaging — fast path for verifying the renderer/main compile
pnpm run build:unpack

# Auto-format the repo with Prettier (separate from `lint`, which only checks)
pnpm run format

# Minify locale files (required for production builds, skip during dev)
pnpm run minify-locales

# Performance debugging — exposes a Node inspector on :5858 against the previewed build
pnpm run perf:inspect       # attach when ready
pnpm run perf:inspect-brk   # break on first line

# Website (not yet wired into CI)
pnpm --filter marktext-website dev      # Vite dev server
pnpm --filter marktext-website build    # static build → packages/website/build/
```

If you need to invoke a script directly inside a package, use
`pnpm --filter <name> <script>` or `pnpm -C packages/<name> <script>`.

## Build Commands

```bash
pnpm run build:win    # Windows x64 — NSIS installer + zip
pnpm run build:mac    # macOS x64 + arm64 — DMG + zip
pnpm run build:linux  # Linux — AppImage, snap, deb, rpm, tar.gz
```

All platform build scripts automatically run `minify-locales` and `electron-rebuild` before packaging.

## Testing

```bash
pnpm run test          # All unit tests (Vitest)
pnpm run test:unit     # Unit tests only
pnpm run test:e2e      # End-to-end tests (Playwright)
pnpm run lint          # ESLint (run before committing; CI enforces)
pnpm run typecheck     # vue-tsc --noEmit (CI enforces)

# Run a single spec — paths are relative to packages/desktop. Use `-C` so
# pnpm resolves the spec path inside the desktop package's vitest config.
pnpm -C packages/desktop exec vitest run test/unit/specs/markdown-basic.spec.ts
pnpm -C packages/desktop exec vitest run -t 'partial test name'

# Single Playwright spec (playwright.config.ts sits at packages/desktop/, so it
# is picked up automatically — run these from that package, not the repo root)
pnpm -C packages/desktop exec playwright test test/e2e/launch.spec.ts
pnpm -C packages/desktop exec playwright test -g 'partial test name'
```

## Code Style

Enforced by ESLint + Prettier. Run `pnpm run lint` and `pnpm run typecheck` before committing.

- 2-space indentation
- No semicolons
- Single quotes
- TypeScript with `strict: true`; see `packages/website/content/docs/dev/TYPESCRIPT.md`
- Cross-process types live in `packages/desktop/src/shared/types/`; ambient declarations in `packages/desktop/src/types/`
- IPC channels are typed via the contract in `packages/desktop/src/shared/types/ipc.ts`
- The renderer is fully sandboxed — every IPC and Node access goes through `window.electron.*` / `window.fileUtils.*` etc. (typed in `packages/desktop/src/types/global.d.ts`)

### Comments

Follow `.github/COMMENTING-GUIDELINES.md` for every comment you write. The core rule: a comment must describe what isn't obvious from the code — rationale, units, invariants, ownership, the abstraction a caller needs — never restate the code or echo the words already in the name. Before finishing any change, review the comments you added or touched against that document, and delete any that only repeat the code. Prefer self-explanatory names over comments; when a comment is genuinely needed, keep it short and complete and place it next to the code it describes.

## Architecture: Three-Process Electron Model

All Electron processes live in `packages/desktop/`. Muya is a separate
workspace package that the renderer (and tests) consume as `@muyajs/core`.

```
main process  (packages/desktop/src/main/)
  ├── Full Node.js + Electron API access
  ├── IO, file system, native dialogs, auto-updater, spell checker
  ├── One instance per application launch
  └── Controls editor windows via IPC

preload  (packages/desktop/src/preload/)
  ├── Bridge between main and renderer
  ├── Note: editor and preferences windows use contextIsolation: false +
  │   nodeIntegration: true (see packages/desktop/src/main/config.js)
  └── Compiled to CommonJS

renderer  (packages/desktop/src/renderer/)
  ├── One process per editor window (spawned by main)
  ├── Vue 3 + Pinia — all UI state and editor interaction
  ├── Hosts both Muya (WYSIWYG) and CodeMirror (source-code mode)
  └── Compiled to ES Modules only

Muya  (packages/muya/)              ← workspace package @muyajs/core
  ├── Self-contained editor backend, TypeScript
  ├── No Electron APIs
  ├── Handles markdown parsing, block data structure, document export, rendering
  └── packages/muyajs/ (the legacy JS engine) is unreferenced and is
      deleted post-0.20.0.
```

## IPC Conventions

Most IPC channels between main and renderer use the `mt::` prefix (e.g. `mt::open-new-tab`, `mt::file-saved`). Some internal channels do not follow this convention (e.g. `language-changed`).

See `packages/website/content/docs/dev/IPC.md` for conventions and examples.

## Further Reading

`packages/website/content/docs/dev/` contains the deeper developer documentation referenced by this guide. Same files are published as the developer docs section on <https://marktext.me/docs/dev/overview>:

- `ARCHITECTURE.md` — process/module layering beyond the summary above
- `BUILD.md` — full platform build prerequisites (including the Arch Linux deps added recently)
- `DEBUGGING.md` — attaching debuggers to main/renderer processes
- `INTERFACE.md` — Muya and renderer public interfaces
- `IPC.md` — full IPC channel catalog and `mt::` conventions
- `LINUX_DEV.md` — Linux-specific dev environment setup
- `PERFORMANCE.md` — perf measurement workflow (pairs with `pnpm run perf:inspect`)
- `RELEASE.md` / `RELEASE_HOTFIX.md` — release process

## Important Build Notes

- **CommonJS vs ESM**: `main` and `preload` compile to CommonJS; `renderer` is ESM-only. Do not use `require()` in renderer code.
- **Minify locales**: `pnpm run minify-locales` must run before production builds. It is included in `build:win/mac/linux` but not in `dev`.
- **Native modules**: After changing Electron version, run `pnpm run rebuild-native` (`electron-rebuild -f`).
- **Hot reload**: The renderer hot-reloads via Vite HMR. `Ctrl+R` in the dev window reloads the renderer and re-runs the preload script. Changes to `main/` source are NOT picked up by a window reload — restart `pnpm run dev` to pick them up.
- **electron-builder output**: `directories.output` in `packages/desktop/electron-builder.yml` is set to `../../dist` so installers land in the repo-root `dist/` (where CI artifact globs look for them). `out/` from electron-vite stays inside `packages/desktop/`.
- **Path aliases** (defined in `packages/desktop/electron.vite.config.ts`, mirrored in `vitest.config.ts` and `tsconfig.base.json`):
  - `@` → `packages/desktop/src/renderer/src`
  - `common` → `packages/desktop/src/common`
  - `@shared` → `packages/desktop/src/shared`
- **`@muyajs/core` resolution**: not a path alias — electron-vite and Vitest resolve it through the package's `exports` map, which points at `packages/muya/src/index.ts`. TypeScript would then pull the whole muya tree into the desktop's program, so `tsconfig.base.json` redirects the types to `../muya/lib/types/index.d.ts`; `pnpm typecheck` and `postinstall` both run `pnpm --filter @muyajs/core build:types` to emit that (git-ignored) directory.
- **Patches**: `patch-package` patches live at `packages/desktop/patches/`. The root `postinstall` calls patch-package with `cwd=packages/desktop` so the path resolves correctly.

## Contribution

- Submit PRs to the **`develop`** branch (not `main`).
- Reference the related issue in the PR description.
- Run `pnpm run lint` before submitting.
- All PRs must pass CI before merge.
- See `.github/CONTRIBUTING.md` for the full contributing guide.
