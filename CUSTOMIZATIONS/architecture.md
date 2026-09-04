# 代码链路图谱 · custom-marktext

> **本文件的目的**：给 AI（及人类）一份「读这一份就能定位代码」的导航地图，
> 避免每次改动/排查都全量扫描源码，节省上下文与 token。
>
> **维护铁律**：改了代码结构（新增函数 / 移动逻辑 / 改数据流 / 改接口），必须同步更新本文件。
> **体量铁律**：超过 ~400 行即拆分——保留 §0 / §0.5 / §1，各模块细节拆到 `docs/arch/<module>.md`。
>
> **配套**：上游自带的架构说明见根 `CLAUDE.md`（上游维护，勿改）；历史坑点见 [`docs/pitfalls.md`](./docs/pitfalls.md)；改动账本见 [`registry.md`](./registry.md)。

---

## 0. 一句话架构

pnpm monorepo：**`packages/desktop`** 是 Electron 应用（主进程 main / 预加载 preload / Vue3+Pinia 渲染进程 renderer）；
编辑引擎是 **`packages/muya`**（@muyajs/core，TS 重写版：ot-json1 状态树 + snabbdom 渲染），旧引擎 **`packages/muyajs`** 退役中；
`packages/website` 是官网（独立工具链，不参与 desktop CI）。根 `package.json` 只是编排器，所有 CI 脚本经 `pnpm --filter marktext` 代理到 desktop。

```
packages/desktop/src/
  main/        Electron 主进程：窗口管理(windows/)、文件IO(filesystem/)、菜单(menu/)、
               快捷键(keyboard/)、偏好(preferences/)、IPC(ipc/)、拼写检查(spellchecker/)
  preload/     contextBridge（sandbox 渲染进程唯一通道；编辑器/设置窗口例外：nodeIntegration: true）
  renderer/    Vue3 + Pinia + Element Plus（src/renderer/src/{components,store,pages,prefComponents,...}）
  common/      纯 Node 工具（keybinding 归一化、i18n、主题、文件系统）
  shared/      跨进程类型（shared/types/ipc.ts = IPC 契约）
packages/muya/src/
  muya.ts      Muya 类 + 插件注册（Muya.use）
  editor/      Editor：JSONState(ot-json1 源真相) + 事件分发 + updateContents
  block/       块树（ScrollPage → 容器块 → Content/Format 叶子；registerBlocks 注册）
  state/       markdownToState / stateToMarkdown / getTOC
  inlineRenderer/  行内 tokenize + snabbdom 渲染
  ui/          浮动工具（格式工具栏、图片工具、表情选择器…，@floating-ui/dom 定位）
```

数据流（编辑）：用户输入 → `Editor` DOM 事件（RxJS 合流）→ 活跃块的 `inputHandler` → ot-json1 op → `Editor.updateContents`（块树 + JSON 状态同步）→ snabbdom 渲染。
文件持久化：renderer 经 IPC（`mt::` 前缀通道）→ main 的 filesystem/commands → 磁盘；偏好设置走 preferences/schema.json 校验 + dataCenter。

技术栈 / 关键约束：pnpm ≥10（禁 npm/yarn）；ESLint + Prettier（无分号、单引号、2 空格）；Vitest（desktop 单测在 `packages/desktop/test/unit/`）；Playwright（e2e）；TypeScript strict（`vue-tsc --noEmit`）；renderer 纯 ESM（禁 require）。

---

## 0.5 任务作用域路由（先定范围，避免污染上下文）

| 任务类型                      | 该读（仅限）                                                                                                        | 可忽略             | 入口 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ | ---- |
| 偏好设置（加新选项/改默认值） | `main/preferences/schema.json` + `renderer/src/prefComponents/<分区>/` + `renderer/src/store/preferences.ts`        | muya 内部、website | §2.1 |
| 快捷键（菜单/键位）           | `main/keyboard/keybindings{Darwin,Linux,Windows}.ts` + `common/keybinding/index.ts` + `prefComponents/keybindings/` | 导出、website      | §2.2 |
| 编辑行为（输入/换行/删除）    | `muya/src/block/<块类型>/` + `muya/src/editor/index.ts`                                                             | main、菜单         | §2.3 |
| Markdown 语法/渲染            | `muya/src/state/` + `muya/src/inlineRenderer/` + `muya/src/block/`                                                  | preferences UI     | §2.4 |
| 新块类型/新语法元素           | `muya/src/block/`（新类 + `block/index.ts` 注册）+ `state/markdownToState.ts`                                       | 窗口、快捷键       | §2.3 |
| 文件打开/保存/标签页          | `main/commands/{file,tab}.ts` + `main/filesystem/` + `renderer/src/components/editorWithTabs/`                      | muya 内部          | §2.5 |
| IPC 新通道                    | `desktop/src/shared/types/ipc.ts` + `main/ipc/<域>.ts` + `preload/index.ts` + renderer 调用方                       | website、muya      | §2.6 |
| 窗口/标题栏/主题              | `main/windows/` + `renderer/src/components/titleBar/` + `common/theme.ts`                                           | muya、文件命令     | §2.7 |
| i18n 文案                     | `static/locales/<lang>.json` + `docs/i18n/`（README 翻译，与 locales 无关）                                         | 全部代码           | §2.8 |
| 打包/发布                     | `desktop/electron-builder.yml` + 根 `package.json` scripts + `scripts/`                                             | 全部业务代码       | §2.9 |

> 定位优先级：**函数名 grep > 本表**。表过期时以代码为准并顺手订正本表。muya 自成体系：改 muya 前先读 `packages/muya/CLAUDE.md`。

---

## 1. 文件职责速查

| 文件/目录                                                      | 职责                                                     | 何时改它                       |
| -------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| `package.json`（根）                                           | workspace 编排器，脚本经 `pnpm --filter marktext` 代理   | 新增根级脚本                   |
| `packages/desktop/package.json`                                | 应用真实依赖与 dev/build/test 脚本                       | 依赖变更、版本号               |
| `packages/desktop/src/main/index.ts`                           | 主进程入口                                               | 启动顺序/初始化                |
| `packages/desktop/src/main/app/windowManager.ts`               | 窗口生命周期（编辑器/设置窗口）                          | 新窗口类型                     |
| `packages/desktop/src/main/commands/{file,tab}.ts`             | 打开/保存/标签页命令编排                                 | 文件操作行为                   |
| `packages/desktop/src/main/preferences/{index.ts,schema.json}` | 偏好读写 + JSON-Schema 校验（键按 "General--描述" 风格） | **加新偏好项必改 schema.json** |
| `packages/desktop/src/main/keyboard/`                          | 平台键位表 + shortcutHandler                             | 菜单快捷键                     |
| `packages/desktop/src/common/keybinding/index.ts`              | accelerator 归一化/比对（`isEqualAccelerator`）          | 键位判定逻辑                   |
| `packages/desktop/src/shared/types/ipc.ts`                     | IPC 通道契约（`mt::` 前缀）                              | 新通道三处同步改               |
| `packages/desktop/src/preload/index.ts`                        | contextBridge 暴露面                                     | 同上                           |
| `packages/desktop/src/renderer/src/store/`                     | Pinia：editor/preferences/layout/project/…               | UI 状态                        |
| `packages/desktop/src/renderer/src/prefComponents/<分区>/`     | 偏好设置页各分区（general/editor/markdown/…）            | 偏好 UI                        |
| `packages/desktop/src/renderer/src/components/editorWithTabs/` | 编辑器主体 + 标签页                                      | 编辑区 UI                      |
| `packages/desktop/static/locales/*.json`                       | 11 种界面语言文案                                        | 新 UI 文案（en+zh-CN 起步）    |
| `packages/muya/src/muya.ts`                                    | Muya 类、插件注册 `Muya.use`                             | 引擎初始化                     |
| `packages/muya/src/editor/index.ts`                            | 事件分发 + `updateContents`（ot-json1 应用）             | 编辑事务                       |
| `packages/muya/src/block/index.ts`                             | `registerBlocks`——新块类型**必须在此注册**               | 新语法块                       |
| `packages/muya/src/state/`                                     | md↔state↔html 转换、TOC                                  | 序列化/解析                    |
| `packages/desktop/test/unit/`                                  | Vitest 单测（根 `pnpm test` 代理）                       | 配套测试                       |

---

## 2. 任务 → 代码位置反查

### 2.1 偏好设置

| 我要改的东西 | 关键锚点                                                                    | 备注                                          |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------- | -------- | ----- | --- | ---------------------------- |
| 加全局偏好项 | `main/preferences/schema.json`（键名 + description "分区--说明" + default） | schema 是校验源；渲染层偏好读取按 schema 校验 |
| 偏好 UI      | `renderer/src/prefComponents/general                                        | editor                                        | markdown | image | …/` | 新开关照抄同分区现有组件结构 |
| 偏好持久化   | `main/preferences/index.ts` + `main/dataCenter/`                            | 静态默认值在 `static/preference.json`         |
| 渲染层状态   | `renderer/src/store/preferences.ts`                                         | Pinia store                                   |

### 2.2 快捷键

| 我要改的东西      | 关键锚点                                             | 备注                           |
| ----------------- | ---------------------------------------------------- | ------------------------------ |
| 平台默认键位      | `main/keyboard/keybindings{Darwin,Linux,Windows}.ts` | 按菜单 id 组织                 |
| 键位冲突判定      | `common/keybinding/index.ts` 的 `isEqualAccelerator` | 归一化含 cmdorctrl/meta→cmd 等 |
| 用户自定义键位 UI | `prefComponents/keybindings/`                        | 键位记录器组件                 |
| 菜单构建          | `main/menu/`                                         | 菜单项 id 与 keybinding 表联动 |

### 2.3 编辑行为 / 块类型

| 我要改的东西                 | 关键锚点                                                                                 | 备注                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| 某块的行为（输入/回车/退格） | `packages/muya/src/block/<category>/<type>/*.ts` 的 `inputHandler`/`backspaceHandler` 等 | 先读 `packages/muya/CLAUDE.md`        |
| 新块类型                     | 新类继承 `Content`/`Parent` + `block/index.ts::registerBlocks` 注册                      | **不注册则 loadBlock 返回 undefined** |
| 块树结构操作                 | `Editor.updateContents`（ot-json1 op 应用）                                              | 手写 pick/drop 走查                   |
| 浮动工具 UI                  | `packages/muya/src/ui/`（baseFloat/baseScrollFloat）                                     | @floating-ui/dom 定位                 |

### 2.4 Markdown 语法/渲染

| 我要改的东西   | 关键锚点                                                         | 备注                                        |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| md → 状态树    | `muya/src/state/markdownToState.ts`                              | 引用式定义走 paragraph 原样回放（非一等块） |
| 状态树 → md    | `muya/src/state/stateToMarkdown.ts`                              |                                             |
| 行内渲染/高亮  | `muya/src/inlineRenderer/{lexer,rules}` + snabbdom               | KaTeX/Prism/Mermaid 集成于此                |
| 公共规范符合度 | `muya/test/spec/`（expected-failures.json 锁基线，只能升不能降） | 改渲染跑 `pnpm -C packages/muya test:spec`  |

### 2.5 文件与标签页

| 我要改的东西      | 关键锚点                                                           | 备注                                      |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| 打开/保存命令     | `main/commands/file.ts`                                            | 自动保存计时在偏好 autoSave/autoSaveDelay |
| 标签页管理        | `main/commands/tab.ts` + `renderer/src/components/editorWithTabs/` |                                           |
| 文件系统工具      | `main/filesystem/` + `src/common/filesystem/`                      |                                           |
| 最近文件/窗口状态 | `main/dataCenter/`（schema.json 定持久化键）                       |                                           |

### 2.6 IPC 通道

| 我要改的东西 | 关键锚点                                                                                                | 备注                         |
| ------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 新通道       | `shared/types/ipc.ts`（契约）→ `main/ipc/<域>.ts`（handler）→ `preload/index.ts`（暴露）→ renderer 调用 | 四处同步；通道名 `mt::` 前缀 |
| 现有通道目录 | `main/ipc/{fs,window,cmd,paths,fonts,i18n,shell,uploader,ripgrep}.ts`                                   |                              |

### 2.7 窗口/标题栏/主题

| 我要改的东西 | 关键锚点                                 | 备注                                                |
| ------------ | ---------------------------------------- | --------------------------------------------------- |
| 编辑器窗口   | `main/windows/editor.ts`（继承 base.ts） |                                                     |
| 设置窗口     | `main/windows/setting.ts`                | 编辑器/设置窗口 nodeIntegration: true（非 sandbox） |
| 标题栏       | `renderer/src/components/titleBar/`      | titleBarStyle 偏好切换 custom/native                |
| 主题         | `common/theme.ts` + `static/` 主题资源   |                                                     |

### 2.8 i18n

| 我要改的东西 | 关键锚点                                      | 备注                                                                          |
| ------------ | --------------------------------------------- | ----------------------------------------------------------------------------- |
| 界面文案     | `static/locales/{en,zh-CN,…}.json`（11 语言） | 生产构建前跑 `pnpm run minify-locales`（构建脚本已含）；新键至少补 en + zh-CN |
| 渲染层 i18n  | `renderer/src/i18n/index.ts`                  | 语言切换经 IPC 通知 main 重载菜单                                             |

### 2.9 打包/发布

| 我要改的东西 | 关键锚点                                                   | 备注                                                                                                                                               |
| ------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 打包配置     | `packages/desktop/electron-builder.yml`                    | 输出目录 `../../dist`（仓库根 dist/）；产物名 `marktext-win-${arch}-${version}-setup.exe` 等 artifactName 模板                                     |
| 构建脚本     | 根 `package.json`（build:win/mac/linux → filter marktext） | 平台脚本自动含 minify-locales + electron-rebuild                                                                                                   |
| 本地打包入口 | `sh CUSTOMIZATIONS/scripts/manager.sh unpacked\|setup`     | bat 透传 electron-builder `--projectDir packages\desktop`（**不能用 `-C`**，见 pitfalls #5）；内置杀软退避重试（chatbox CUSTOM-20260903-009 经验） |
| 原生模块     | `pnpm run rebuild-native`（electron-rebuild -f）           | 改 Electron 版本后必跑；Spectre 编译坑见 pitfalls #2                                                                                               |
| CI           | `.github/workflows/{build,release,test,…}.yml`             | 上游 CI：PR→develop                                                                                                                                |

---

## 3. 重点链路详解

> 当前无自定义链路。第一个自定义功能落地后，把高频/易错链路按「需求语义 + 关键坑 + 正确实现 + 调用链」格式写到这里。

---

## 4. 数据契约铁律

- **偏好键**：`main/preferences/schema.json` 是唯一校验源，新增键必须同步静态默认值 `static/preference.json` 与 UI 分区；description 格式 "分区--说明" 兼做 i18n 索引。
- **IPC**：通道名 `mt::` 前缀（少数历史通道例外）；契约三处同步（shared/types/ipc.ts、main/ipc/、preload/index.ts）。
- **muya 块注册**：新块类型必须在 `packages/muya/src/block/index.ts::registerBlocks` 注册，否则 `ScrollPage.loadBlock` 告警并返回 undefined。
- **规范基线**：`packages/muya/test/spec/expected-failures.json` 锁定 CommonMark/GFM 通过率——已列条目转通过会**故意**使测试失败（合规只能升）。
- **构建顺序**：生产构建必须先 `minify-locales`（平台 build 脚本已自动包含，`dev` 不含）。
- **渲染进程 ESM**：renderer 代码禁止 `require()`；main/preload 是 CommonJS。
