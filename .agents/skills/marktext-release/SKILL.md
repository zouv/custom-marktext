---
name: 'marktext-release'
description: 'Build and package local installers of the custom marktext (version bump, pre-release checks, electron-builder via manager.sh). Invoke when user asks to build, package, or make an installer of the custom marktext. 发布到 GitHub 请用 marktext-publish skill。'
---

# MarkText 自定义版本打包 Skill

把自定义 marktext 源码**构建打包成本地安装包**，终点是仓库根 `dist/` 下的 `setup.exe` / `.zip`。

**发布到 GitHub（提交 / tag / Release / 改正文 / 上传产物）已拆到 `marktext-publish` skill** —— 打完包或决定走 CI 路径后走那边。

## 与 marktext-publish 的分工

| Skill                        | 职责                          | 起点 → 终点                                               |
| ---------------------------- | ----------------------------- | --------------------------------------------------------- |
| **`marktext-release`（本）** | 从源码到**本地安装包**        | 干净工作区 → `dist/marktext-win-x64-<版本>-setup.exe`     |
| `marktext-publish`           | 从版本号到 **GitHub Release** | 版本号 + release notes → release 上线（含全平台 CI 产物） |

> **多数情况你不需要本 skill**：默认走**路径 A**（推 tag → 上游 CI 全平台构建 24 个资产），直接去 `marktext-publish`。
> 只有**路径 B**（只要 Windows 包、要完全掌控产物与正文）才在推 tag 前先在这里打本地包——注意推 tag 会触发 CI，需先把 `release.yml` 的 trigger 改成 `workflow_dispatch`（CUSTOM 标记 + registry 登记），且**本地与 CI 资产不可混挂**（pitfalls #7）。

## 触发条件

- 用户说"打包"、"打个包"、"生成安装包"、"build"、"package"
- 需要拿到免安装目录（`dist/win-unpacked/`）做本地验证
- 路径 B 发布前需要本地 setup.exe

## 参数收集

1. **版本号**：格式 `v<上游版本>-custom.<N>`。**必须在打包前定好**——版本号内嵌在产物文件名（`marktext-win-x64-<版本>-setup.exe`）与 exe 资源里。未指定时读已有 tag 取最大序号 +1：

   ```bash
   git tag -l "v*-custom.*" --sort=-v:refname | head -5
   ```

   marktext 是 monorepo，版本号在 **`packages/desktop/package.json`**（electron-builder 读这个，不带 `v` 前缀）；根 `package.json` 是私有编排器，version 保持 `0.20.0-dev` 不动。

2. **打包类型**：
   - `setup`（默认）：NSIS 安装包 + zip
   - `unpacked`：免安装目录（本地验证用，最快）

## 前置检查

```bash
git branch --show-current      # 必须是 custom/main
git status --porcelain         # 建议干净
node --version                 # >= 20.19
pnpm --version                 # >= 10
```

## 执行流程

### 第一步：定版本号并更新

改 `packages/desktop/package.json` 的 `version`（不带 `v`）。改动区域按仓库规范用 `[CUSTOM-BEGIN]/[CUSTOM-END]` 标记包裹。

### 第二步：发布前检查

```bash
pnpm install --frozen-lockfile --ignore-scripts   # 不要跑完整的 pnpm install，见坑点 3
pnpm run lint         # 必须 0 error
pnpm run typecheck
pnpm run test         # 有失败时报告用户决定是否继续，见坑点 4
```

### 第三步：打包

统一走 `manager.sh`（内含 7za shim 检查、结束占用产物的进程、electron-builder 失败后的 15s 退避重试）：

```bash
sh CUSTOMIZATIONS/scripts/manager.sh setup      # NSIS 安装包 + zip
sh CUSTOMIZATIONS/scripts/manager.sh unpacked   # 免安装目录（快速验证）
sh CUSTOMIZATIONS/scripts/manager.sh artifacts  # 查看产物
```

也可以直接调 npm 脚本（**不含**上面那层保护，失败重试要手动做）：

```bash
pnpm run build:win        # Windows x64：NSIS + zip（自动 minify-locales + electron-rebuild）
# 或 build:mac / build:linux
```

产物目录：**仓库根 `dist/`**（`packages/desktop/electron-builder.yml` 的 `directories.output: ../../dist`；`out/` 是 electron-vite 中间产物，勿混淆）。

```bash
ls dist/    # 确认 .exe / .zip 及 blockmap
```

**打包环境注意**：Windows 杀软实时防护可能短暂锁住刚写出的 exe，导致 rcedit/electron-builder 失败——失败后等 15s 重跑整个 builder（最多 3 轮），或将仓库目录加入杀软信任区（`manager.sh` 已内置该退避）。

### 第四步：产物核验

```bash
# 版本号内嵌校验（防止发布与版本号不符的包）
powershell -NoProfile -Command "(Get-Item 'dist\marktext-win-x64-<版本>-setup.exe').VersionInfo.FileVersion"
# 应输出与版本号一致的 0.20.0-custom.N
```

路径 B 的下一步（改 `release.yml` trigger、上传产物、改正文）走 **`marktext-publish`** skill。

## 坑点与经验

### 1. electron-builder 命令行 `-C` 无效（monorepo 场景）

`npx electron-builder build -C packages/desktop` 会打印 usage 并报 `Unknown argument: C`——electron-builder 的项目目录参数是 `--projectDir`/`--project`，`-C` 是 `--config` 的缩写。`manager.sh` 已用 `--projectDir packages\desktop` 调好（pitfalls #5）。

### 2. 产物名与输出目录以 desktop 包的 electron-builder.yml 为准

本仓库是 `marktext-win-${arch}-${version}-setup.exe`（不是默认的 `${productName}-Setup.exe`），输出落在仓库根 `dist/`。别照抄单包仓库（如 chatbox）的路径。

### 3. 打包前不要跑完整的 `pnpm install`

本仓库 `postinstall` 会跑 electron-rebuild，而 native-keymap 的 Spectre 修复目前只存在于 `node_modules` 里（**尚未写进 `packages/desktop/patches/`**），`pnpm install` 会重置它 → `MSB8040` 失败（pitfalls #2）。只想验证 lockfile 一致性用 `pnpm install --frozen-lockfile --ignore-scripts`。

### 4. 本机测试有既有浮动基线，不要因此卡发布

`pnpm run test`（Windows）实测 **761 通过 / 11 失败**：7 个是上游 `move-image-to-folder.spec.ts` 硬编码 `'assets/'` 前缀断言（win32 下 `path.relative` 产出反斜杠）——POSIX 专用 spec；4 个是 `pdf.spec.ts` 在整包并发下的 5s 超时（隔离重跑即通过，数量浮动）。

判定"是不是本次改动引入的"：`git diff <上一个 tag>..HEAD -- <相关测试文件>` 为空 ⇒ 不可能影响该子系统；或重跑看失败数量是否浮动。确认是基线后**向用户报告、由用户决定是否继续**。

### 5. lint 必须 0 error，且提交钩子会改写文件

`lint.yml` 只在 `pull_request` 触发，custom/main 的提交不受 CI 卡关，lint error 会静默累积——**本地 `pnpm run lint` 是唯一防线**。提交钩子（lint-staged）会改写暂存内容，**提交后要复验**（`git show HEAD:<file>`），不能只看提交前的结果（pitfalls #8）。

### 6. 管道会吃掉退出码

```bash
pnpm run test 2>&1 | tail -60     # ❌ 退出码是 tail 的，测试失败也返回 0
pnpm run test > /tmp/t.log 2>&1   # ✅ 重定向到文件，再 grep / Read
```

## 重要约束

1. **不跳过 lint/typecheck/build 检查**
2. **版本号必须在打包前改**（内嵌在产物名与 exe 资源里，事后改无效）
3. **产物不提交 git**：`dist/`、`out/` 已在 `.gitignore`
4. **不手改 pnpm-lock.yaml**
5. **版本号只改 `packages/desktop/package.json`**（根 monorepo 版本不动）
6. **本地产物与 CI 产物不可混挂**（pitfalls #7）
