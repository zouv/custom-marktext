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

```bash
gh auth status   # 发布 Release 用；未登录则 gh auth login
```

gh 不可用时提示用户安装（`winget install GitHub.cli`）或手动上传。

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

### 第四步：打包

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

### 第六步：创建 GitHub Release

```bash
gh release create "<custom-version>" \
  dist/<artifact-1> dist/<artifact-2> \
  --title "<custom-version>" \
  --notes-file CUSTOMIZATIONS/release-notes/<custom-version>.md \
  --target custom/main
```

基线为 develop 提交（非正式 tag）时加 `--prerelease`。

### 第七步：验证与报告

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
