---
name: 'marktext-release'
description: 'Build and publish a release of the custom marktext build to GitHub. Invoke when user asks to build, package, publish, release, or create a new version/tag of the custom marktext.'
---

# MarkText 自定义版本发布 Skill

本 Skill 用于构建、打包并发布自定义 marktext 版本到 GitHub Releases。

## 触发条件

- 用户说"发布"、"打包"、"打 release"、"build release"、"publish"
- 需要生成安装包分发给用户
- 需要打一个版本 tag

## 参数收集

1. **版本号**：格式 `v<上游版本>-custom.N`（N 为数字序号）。例如基于 develop@1d3025b2（对应 0.20.0-dev）的第一个自定义发布为 `v0.20.0-custom.1`；基于正式 tag v0.20.0 则为 `v0.20.0-custom.1`。
   - 未指定时从已有 tag 读最大序号 +1（`git tag -l "v*-custom.*" --sort=-v:refname | head -10`）

2. **构建平台**：
   - `current`（默认）：仅当前平台（Windows 用 `build:win`）
   - 指定平台：`windows` / `mac` / `linux`（mac 构建需在 Mac 上）

3. **是否预发布**：基线是 develop 提交而非正式 tag 时，默认建议 `--prerelease`

4. **Release 说明**：用户未提供时，AI 根据 CUSTOMIZATIONS/registry.md 总览（active 条目）与近期 commit 生成；须包含：基于的上游版本、自定义功能、已知问题

## 前置检查

### 1. 仓库状态

```bash
git branch --show-current    # 必须在 custom/main
git status --porcelain       # 必须干净
```

### 2. 环境检查

```bash
node --version   # >= 20.19
pnpm --version   # >= 10
```

### 3. GitHub 认证

两条路都可用：**自动化脚本走 GCM token，人工排查走 gh CLI**。

**a) GCM token（`publish-release.mjs` 内部使用）** —— Git Credential Manager 里存有可用 token（scopes 含 `repo`），脚本用 `git credential fill` 读取，只在运行时读取、不落盘、不回显。与 gh 是否登录无关。

```bash
# 自查：能打印出用户名即说明凭证可用（不会打印 token 本身）
printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^username=//p'
```

**b) gh CLI** —— 2026-09-15 已安装（`C:\Program Files\GitHub CLI`，**不在 PATH 里**，用前先 `export PATH="$PATH:/c/Program Files/GitHub CLI"`）并 `gh auth login` 完成（账号 zouv，凭据存 keyring，scopes 含 `repo`/`workflow`）。

> ⚠️ **陷阱：gh 在本仓库默认解析到上游 `marktext/marktext`，而不是 `zouv/custom-marktext`** —— 本仓库有 `origin` + `upstream` 两个 remote，gh 挑中了 upstream。**不加 `--repo` 的 gh 命令会打到上游仓库去**（`gh release list` 列出的是上游的 release），发布类操作前务必先确认：`gh repo view --json nameWithOwner --jq .nameWithOwner`。
>
> 一次性修好：`git config remote.origin.gh-resolved base`。这只写本地 `.git/config`、**不随仓库分发**，新 clone 要重设一次（不设的话脚本不受影响，只有 gh 命令会走错仓库）。

### 4. 发布路径二选一（重要，见 pitfalls #7）

上游自带的 `.github/workflows/release.yml` 是 `on: push: tags: v*` 触发的——**推 tag 就会自动全平台构建并创建/覆盖 release**。两条路径必须二选一，**不可混挂资产**（本地构建与 CI 构建同名不同内容，SHA-256 必不同）：

| 路径          | 做法                                                                                                                                   | 适用                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **A（推荐）** | 不本地打包。推 tag → CI 全平台构建 24 个资产 → 用 `publish-release.mjs --body-only` 把正文改回我们的 notes                             | 需要全平台产物；省去本地 15min 打包 |
| **B**         | 推 tag 前先把 `release.yml` 的 trigger 改成 `workflow_dispatch`（CUSTOM 标记 + registry 登记），再本地 `build:win` 并用 `--asset` 上传 | 只要 Windows、要完全掌控正文与产物  |

## 执行流程

### 第一步：更新版本号

marktext 是 monorepo，版本号在 **`packages/desktop/package.json`**（Electron 应用包，electron-builder 读这个）；根 `package.json` 是 `marktext-monorepo` 私有编排器（version 保持 `0.20.0-dev` 风格不动）。

```bash
# packages/desktop/package.json: "version": "0.20.0-custom.1"（不带 v 前缀）
```

改动区域用 `[CUSTOM-BEGIN]/[CUSTOM-END]` 标记包裹（标记 id 对应本次 bump 所属的发布动作，或复用版本管理条目的演进链）。

### 第二步：完整检查与构建

```bash
pnpm install --frozen-lockfile
pnpm run lint         # 不通过必须修复
pnpm run typecheck
pnpm run test         # 失败时报告用户决定是否继续
pnpm run build:unpack # 先验证可构建
```

### 第三步：更新 registry.md 并生成 Release Notes

frontmatter 更新：`custom_version` / `last_release_version` / `last_release_date`。

Release Notes 落盘 `CUSTOMIZATIONS/release-notes/<custom-version>.md`（随仓库提交）：

```markdown
## <custom-version> (<date>)

基于上游 marktext <upstream-ref> 的自定义版本。

### 自定义改动

<按 registry.md 总览 active 条目生成>

- **<change-id>**: <描述>

### 已知问题

<如有>

### 下载

- Windows: <安装包文件名>

---

**完整自定义改动清单**：见 CUSTOMIZATIONS/registry.md
**上游版本**：marktext/marktext@<upstream-ref>
```

### 第四步：打包（仅路径 B）

**路径 A（推荐）跳过本步**——产物由 CI 全平台构建，本地不打包。

路径 B（本地 Windows 包）才需要：

```bash
pnpm run build:win        # Windows x64：NSIS + zip（自动 minify-locales + electron-rebuild）
# 或 build:mac / build:linux
```

产物目录：**仓库根 `dist/`**（`packages/desktop/electron-builder.yml` 的 `directories.output: ../../dist`；`out/` 是 electron-vite 中间产物，勿混淆）。

```bash
ls dist/    # 确认 .exe / .zip 及 blockmap
```

**打包环境注意**（参考 chatbox 项目经验）：Windows 杀软实时防护可能短暂锁住刚写出的 exe 导致 rcedit/electron-builder 失败——失败后等 15s 重跑整个 builder（最多 3 轮）；或将仓库目录加入杀软信任区。

### 第五步：提交与打 Tag

```bash
git add packages/desktop/package.json CUSTOMIZATIONS/registry.md CUSTOMIZATIONS/release-notes/<custom-version>.md
git commit -m "chore(release): bump version to <custom-version>"

git tag -a "<custom-version>" -m "Release <custom-version>

Based on upstream marktext <upstream-ref>

Custom changes:
- <change-id>: <desc>"

git push origin custom/main
git push origin "<custom-version>"
```

> ⚠️ `git push origin "<custom-version>"` 这一步会**立即触发上游 `release.yml` 的全平台构建**（约 15 分钟）。推送前确认发布提交已经定稿——**tag 打好后不要再 amend/改写该提交**，否则 tag 会留在游离提交上（后续用 tag 算 diff 基准会出错）。

### 第六步：等待 / 创建 GitHub Release

推 tag 后 CI 会自动构建并抢先创建 release，并把**正文覆盖成上游模板**（pitfalls #7）。等它跑完，把正文改回我们的 release notes：

```bash
# 幂等，可重跑；release 尚未出现时会轮询等待 CI（最多 30 分钟）
node CUSTOMIZATIONS/scripts/publish-release.mjs "<custom-version>" --body-only --wait 1800
```

- 路径 A（CI 全平台）：如上，不传 `--asset`。
- 路径 B（本地打包）：`--asset dist/<产物> --asset dist/<产物>.blockmap`，同名旧资产会先删后传。
- 基线为 develop 提交（非正式 tag）时加 `--prerelease`。

### 第七步：验证与报告

上一条命令末尾会打印远端 release 状态（draft / prerelease / 资产数量与 `uploaded` 状态）——确认资产齐备且正文是我们的 notes 即通过。再在浏览器打开 release 页面肉眼确认一遍，并下载一个产物验证。

```
=== Release 发布完成 ===
版本：<custom-version>
基于上游：<upstream-ref>
Tag：<custom-version>（已推送）
Release URL：https://github.com/zouv/custom-marktext/releases/tag/<custom-version>
构建产物：
- <filename> (<size>)
```

浏览器确认上传成功，下载验证。

## 坑点与经验

### 1. 管道会吃掉退出码 —— 别用 `| tail` 判断成败

```bash
pnpm run test 2>&1 | tail -60     # ❌ 退出码是 tail 的，测试失败也返回 0
pnpm run test > /tmp/t.log 2>&1   # ✅ 重定向到文件，再 grep / Read
```

本次发布真实踩过：后台跑 `pnpm run test | tail -25` 报告 "exit code 0"，实际是 11 个用例失败。凡是要靠退出码判断成败的场合，一律重定向到文件（或 `set -o pipefail`）。

### 2. 本机测试/lint 有既有浮动基线，不要因此卡发布

- `pnpm run test`（Windows）实测 **761 通过 / 11 失败**：7 个是上游 `move-image-to-folder.spec.ts` 硬编码 `'assets/'` 前缀断言（win32 下 `path.relative` 产出反斜杠）——POSIX 专用 spec；4 个是 `pdf.spec.ts` 在整包并发下的 5s 超时（隔离重跑即通过，数量浮动）
- 判定"是不是本次改动引入的"：`git diff <上一个 tag>..HEAD -- <相关测试文件>` 为空 ⇒ 不可能影响该子系统；或重跑看失败数量是否浮动

确认是基线后**向用户报告、由用户决定是否继续**，并把实测数字写进 release notes 的「已知问题」（不要照抄上一版的旧数字）。

### 3. 发布前不要跑 `pnpm install`

依赖没变时不要跑：本仓库 `postinstall` 会跑 electron-rebuild，而 native-keymap 的 Spectre 修复目前只存在于 `node_modules` 里（**尚未写进 `packages/desktop/patches/`**），`pnpm install` 会重置它 → `MSB8040` 失败（pitfalls #2）。只想验证 lockfile 一致性就用 `pnpm install --frozen-lockfile --ignore-scripts`。

### 4. 轮询 CI 要用 token；改正文要等 CI **整体跑完**

匿名访问 GitHub API 限流 **60 次/小时**。本次发布用匿名 curl 每 45s 轮询 Actions 状态，约 20 分钟就耗尽额度，之后持续报 `parse-error`（真相是 403 限流），而 CI 其实早已 success——差点误判成"CI 卡住"。

- `publish-release.mjs` 内部用的是 GCM token（5000 次/小时），不受此限流影响；自己写轮询脚本时也要带 token，或干脆隔几分钟查一次
- **顺序要求**：`--body-only` 必须等 **CI 工作流整体 `completed`** 之后再跑，不能只等 release 出现——CI 是「先建 draft 写入模板正文 → 再提升为 published」，中途 PATCH 有被覆盖的风险
- `--prerelease` 要显式传：PATCH 会一并更新 `prerelease` 字段，漏传会把 CI 设好的预发布标记改成 `false`

## 版本号规范

```
v<上游版本>-custom.<N>
例：v0.20.0-custom.1, v0.20.0-custom.2
上游大版本切换后 N 重置为 1
预发布：v0.20.0-custom.1-beta.1
```

## 重要约束

1. **不跳过 lint/typecheck/build 检查**
2. **不在有未提交改动时发布**
3. **Tag 必须 annotated tag**（`-a`）
4. **产物不提交 git**：`dist/`、`out/` 已在 `.gitignore`
5. **不手改 pnpm-lock.yaml**
6. **版本号只改 `packages/desktop/package.json`**（根 monorepo 版本不动；electron-builder 只认 desktop 包）
7. **发布失败回滚**：tag 已建但 release 上传失败 → `git tag -d <v> && git push origin :refs/tags/<v>` 后重试；release 已发的严重问题 → 标 deprecated 发新版本，不删已有 release
8. **发布由用户明确发起**：本 skill 的 commit/tag/push 属于发布流程的固有步骤，用户要求发布时按步骤执行；流程中止（检查失败、产物异常）时停在未提交状态先报告
