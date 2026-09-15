---
name: 'marktext-publish'
description: 'Publish the custom marktext build to GitHub Releases (version bump, release notes, commit, tag, push, wait for CI, restore the CI-overwritten release body, verify assets). Invoke when user asks to publish/upload a release to GitHub, push a release, cut a new version, or create a GitHub Release.'
---

# MarkText 发布到 GitHub Skill

把**已定好的版本**发布到 GitHub Releases。本 skill 覆盖「版本号 → release 上线」这一段。

## 与 marktext-release 的分工

| Skill                        | 职责                           | 起点 → 终点                                               |
| ---------------------------- | ------------------------------ | --------------------------------------------------------- |
| `marktext-release`           | 从源码到**本地安装包**（可选） | 干净工作区 → `dist/marktext-win-x64-<版本>-setup.exe`     |
| **`marktext-publish`（本）** | 从版本号到 **GitHub Release**  | 版本号 + release notes → release 上线（含全平台 CI 产物） |

**路径 A（推荐，默认）不需要本地打包**：推 tag 后上游 `release.yml` 全平台构建 24 个资产，本 skill 等它跑完、把被 CI 模板覆盖的正文改回我们的 release notes。只有路径 B（只要 Windows、要完全掌控产物）才先走 `marktext-release` 打本地包。

## 快速路径

```bash
# 0) 定版本号：读已有 tag 取最大序号 +1
git tag -l "v*-custom.*" --sort=-v:refname | head -5

# 1) 改版本号 + 写 release notes + 改 registry frontmatter（见执行流程 1、2 步）

# 2) 发布前检查（见执行流程 3 步）——lint 必须 0 error

# 3) 干跑校验（不发网络请求）
node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.N --dry-run

# 4) 提交 + 打 annotated tag + 推送
git add packages/desktop/package.json CUSTOMIZATIONS/registry.md \
        CUSTOMIZATIONS/release-notes/v0.20.0-custom.N.md
git commit -m "chore(release): bump version to v0.20.0-custom.N"
git tag -a v0.20.0-custom.N -m "Release v0.20.0-custom.N

Based on upstream marktext <upstream-ref>"
git push origin custom/main
git push origin v0.20.0-custom.N        # ← 触发 CI 全平台构建（约 15 分钟）

# 5) 等 CI 跑完 → 改回正文 → 核验（幂等，可重跑）
node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.N \
  --body-only --wait 1800 --prerelease
```

## 前置检查

```bash
git branch --show-current      # 必须是 custom/main
git status --porcelain         # 必须干净
node --version                 # >= 20.19
pnpm --version                 # >= 10
node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.N --dry-run
```

### GitHub 认证

两条路都可用：**自动化脚本走 GCM token，人工排查走 gh CLI**。

**a) GCM token（`publish-release.mjs` 内部使用）** —— Git Credential Manager 里存有可用 token（scopes 含 `repo`），脚本用 `git credential fill` 读取，只在运行时读取、不落盘、不回显。与 gh 是否登录无关。

```bash
# 自查：能打印出用户名即说明凭证可用（不会打印 token 本身）
printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^username=//p'
```

**b) gh CLI** —— 2026-09-15 已安装（`C:\Program Files\GitHub CLI`，**不在 PATH 里**，用前 `export PATH="$PATH:/c/Program Files/GitHub CLI"`）并 `gh auth login` 完成（账号 zouv，keyring）。

> ⚠️ **陷阱：gh 在本仓库默认解析到上游 `marktext/marktext`** —— 本仓库有 `origin` + `upstream` 两个 remote，gh 挑中了 upstream。**不加 `--repo` 的 gh 命令会打到上游仓库去**（`gh release list` 列出的是上游的 release）。发布类操作前先确认：`gh repo view --json nameWithOwner --jq .nameWithOwner`。
>
> 一次性修好：`git config remote.origin.gh-resolved base`。只写本地 `.git/config`、**不随仓库分发**，新 clone 要重设（不设只影响 gh 命令，不影响 `publish-release.mjs`）。

## 执行流程

### 第一步：定版本号并更新

格式 `v<上游版本>-custom.<N>`，N 从已有 tag 的最大序号 +1。marktext 是 monorepo，版本号在 **`packages/desktop/package.json`**（electron-builder 读这个，**不带 `v` 前缀**）；根 `package.json` 是私有编排器，version 保持 `0.20.0-dev` 不动。

```json
// packages/desktop/package.json
"version": "0.20.0-custom.N"
```

### 第二步：更新 registry frontmatter + 写 release notes

`CUSTOMIZATIONS/registry.md` 头部三个字段：

```yaml
custom_version: 'v0.20.0-custom.N'
last_release_version: 'v0.20.0-custom.N'
last_release_date: 'YYYY-MM-DD'
```

release notes 落盘 `CUSTOMIZATIONS/release-notes/v0.20.0-custom.N.md`（随仓库提交，格式照抄上一版）。内容来源：`git log --oneline <上一个发布 tag>..HEAD` + registry 变更日志。须包含：基于的上游版本、本版新增、修复与改进、**已知问题（含本机测试实测数字）**、下载（按 CI 全平台资产名写全）。

同时按仓库惯例在 `CUSTOMIZATIONS/registry.md` 变更日志追加一条 `### <日期> - CUSTOM-<YYYYMMDD>-00N（发布 vX.Y.Z-custom.N）`。

### 第三步：发布前检查

```bash
pnpm install --frozen-lockfile --ignore-scripts   # 不要跑完整的 pnpm install，见坑点 3
pnpm run lint         # 必须 0 error
pnpm run typecheck
pnpm run test         # 有失败时报告用户决定是否继续，见坑点 2
pnpm run build:unpack # 验证可构建（不打包）
```

### 第四步：提交 + 打 tag + 推送

```bash
git add packages/desktop/package.json CUSTOMIZATIONS/registry.md \
        CUSTOMIZATIONS/release-notes/v0.20.0-custom.N.md
git commit -m "chore(release): bump version to v0.20.0-custom.N"
git tag -a v0.20.0-custom.N -m "Release v0.20.0-custom.N

Based on upstream marktext <upstream-ref>

Custom changes:
- <change-id>: <desc>"

git push origin custom/main
git push origin v0.20.0-custom.N
```

> ⚠️ 推 tag 会**立即触发上游 `release.yml` 的全平台构建**（约 15 分钟）。推送前确认发布提交已定稿——**tag 打好后不要 amend/改写该提交**，否则 tag 留在游离提交上，后续用 tag 算 diff 基准会出错（可用 `git merge-base --is-ancestor <tag> HEAD` 自检）。

### 第五步：等 CI 跑完 → 改回正文 → 核验

CI 会自动建 release、用**自带模板覆盖正文**（pitfalls #7）。等它整体跑完再改回我们的 notes：

```bash
node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.N \
  --body-only --wait 1800 --prerelease
```

- **`--wait`**：release 尚未出现时轮询等待（脚本用 token 轮询，不受匿名限流影响）
- **`--prerelease` 必须显式传**：PATCH 会一并更新 `prerelease` 字段，漏传会把 CI 设好的预发布标记改成 `false`
- 脚本幂等：release 已存在则复用 + 覆盖正文；传 `--asset` 时会先删同名旧资产再传（路径 B 用）

### 第六步：验证与报告

上一条命令会打印远端状态（tag / draft / prerelease / 资产清单与 `uploaded` 状态）。再用 gh 交叉核对：

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh release view v0.20.0-custom.N \
  --json tagName,isDraft,isPrerelease,assets \
  --jq '"\(.tagName) draft=\(.isDraft) prerelease=\(.isPrerelease) 资产 \(.assets|length) 个（\(.assets|map(.state)|unique|join(","))）"'
```

正文核验（确认没被 CI 模板留占）：下载 release 页面对照，或 `.body | contains("<本版特征串>")`。最后在浏览器打开 release 页面肉眼确认。

```
=== Release 发布完成 ===
版本：v0.20.0-custom.N
基于上游：<upstream-ref>
Tag：v0.20.0-custom.N（已推送，在 custom/main 历史上）
Release URL：https://github.com/zouv/custom-marktext/releases/tag/v0.20.0-custom.N
资产：24 个（全平台 CI 构建，全部 uploaded）
```

## 坑点与经验

### 1. 管道会吃掉退出码 —— 别用 `| tail` 判断成败

```bash
pnpm run test 2>&1 | tail -60     # ❌ 退出码是 tail 的，测试失败也返回 0
pnpm run test > /tmp/t.log 2>&1   # ✅ 重定向到文件，再 grep / Read
```

真实踩过：后台跑 `pnpm run test | tail -25` 报告 "exit code 0"，实际 11 个用例失败。凡是要靠退出码判断成败的场合，一律重定向到文件（或 `set -o pipefail`）。

### 2. 本机测试有既有浮动基线，不要因此卡发布

`pnpm run test`（Windows）实测 **761 通过 / 11 失败**：7 个是上游 `move-image-to-folder.spec.ts` 硬编码 `'assets/'` 前缀断言（win32 下 `path.relative` 产出反斜杠）——POSIX 专用 spec；4 个是 `pdf.spec.ts` 在整包并发下的 5s 超时（隔离重跑即通过，数量浮动）。

判定"是不是本次改动引入的"：`git diff <上一个 tag>..HEAD -- <相关测试文件>` 为空 ⇒ 不可能影响该子系统；或重跑看失败数量是否浮动。确认是基线后**向用户报告、由用户决定是否继续**，并把实测数字写进 release notes 的「已知问题」（不要照抄上一版旧数字）。

### 3. 发布前不要跑完整的 `pnpm install`

依赖没变时不要跑：本仓库 `postinstall` 会跑 electron-rebuild，而 native-keymap 的 Spectre 修复目前只存在于 `node_modules` 里（**尚未写进 `packages/desktop/patches/`**），`pnpm install` 会重置它 → `MSB8040` 失败（pitfalls #2）。只想验证 lockfile 一致性用 `pnpm install --frozen-lockfile --ignore-scripts`。

### 4. 轮询 CI 要用 token；改正文要等 CI **整体跑完**

匿名访问 GitHub API 限流 **60 次/小时**。曾用匿名 curl 每 45s 轮询 Actions 状态，约 20 分钟耗尽额度，之后持续报 `parse-error`（真相是 403 限流），差点误判成"CI 卡住"（实际早已 success）。

- `publish-release.mjs` 内部用 GCM token（5000 次/小时），不受此限流；自己写轮询也要带 token，或隔几分钟查一次
- **顺序要求**：`--body-only` 必须等 **CI 工作流整体 `completed`** 后再跑，不能只等 release 出现——CI 是「先建 draft 写模板正文 → 再提升 published」，中途 PATCH 有被覆盖风险
- gh 查 CI：`gh run list --workflow=release.yml --limit 3`

### 5. lint 必须 0 error，且要注意 pre-commit 钩子会改写文件

`lint.yml` 只在 `pull_request` 触发，custom/main 的提交不受 CI 卡关，lint error 会静默累积——**本地 `pnpm run lint` 是唯一防线**。另外提交钩子会改写暂存内容，**提交后要复验产物**（`git show HEAD:<file>`），不能只看提交前的检查结果（详见 pitfalls #8）。

## 失败处理与回滚

| 情况                                | 处理                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| tag 已推送、release 上传/改正文失败 | 直接重跑 `publish-release.mjs`（幂等）                                                           |
| tag 打错提交、尚未推送              | `git tag -d <版本>` 后重新打                                                                     |
| tag 已推送但打错                    | `git tag -d <版本> && git push origin :refs/tags/<版本>` 后重打；**仅在 release 尚未对外有效时** |
| CI 构建失败                         | 看 `gh run view <id> --log-failed`；修好后发新版本（tag 已发布则不要复用同名 tag）               |
| 资产字节数与远端不符                | 脚本已自动做同名替换，重跑即可                                                                   |
| release 已发布但有严重问题          | **不要删已有 release**，标 deprecated 并发新版本                                                 |

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
3. **Tag 必须 annotated tag**（`-a`），且必须在 custom/main 历史上
4. **产物不提交 git**：`dist/`、`out/` 已在 `.gitignore`
5. **不手改 pnpm-lock.yaml**
6. **版本号只改 `packages/desktop/package.json`**（根 monorepo 版本不动）
7. **本地产物与 CI 产物不可混挂**：同名不同内容（SHA-256 必不同），二选一（pitfalls #7）
8. **发布由用户明确发起**：本 skill 的 commit/tag/push 属于发布流程的固有步骤，用户要求发布时按步骤执行；流程中止（检查失败、产物异常）时停在未提交状态先报告
