#!/usr/bin/env node
/**
 * publish-release.mjs —— 把 release notes / 产物发布到 GitHub Release
 *
 * 配套 skill：.agents/skills/marktext-release/SKILL.md
 * 背景：本机未安装 gh CLI，改用 Git Credential Manager 里的 token 走 GitHub REST API
 *       （token 只在运行时读取、不落盘、不回显）。全程幂等：release 已存在则复用，
 *       同名资产先删后传，正文按 notes 文件覆盖，可反复重跑。
 *
 * marktext 与 chatbox 的差异：本仓库推 tag 会触发上游自带的 release.yml 全平台构建
 * （见 CUSTOMIZATIONS/docs/pitfalls.md #7），release 由 CI 抢先创建、且正文被 CI 模板覆盖。
 * 因此本脚本的核心用法是 `--body-only --wait`：等 CI 把 release 建好、再把正文改回我们的
 * release notes。本地打包场景（方案 B）可用 --asset 上传产物。
 *
 * 用法（在仓库根目录执行）：
 *   # CI 路径（推荐）：等 CI 创建 release，然后改回我们的正文
 *   node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.2 --body-only --wait 1800
 *
 *   # 仅校验，不发网络请求
 *   node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.2 --dry-run
 *
 *   # 本地打包路径：上传产物（可重复 --asset）
 *   node CUSTOMIZATIONS/scripts/publish-release.mjs v0.20.0-custom.2 \
 *     --asset dist/marktext-win-x64-0.20.0-custom.2-setup.exe \
 *     --asset dist/marktext-win-x64-0.20.0-custom.2-setup.exe.blockmap
 *
 * 默认值：
 *   --notes   CUSTOMIZATIONS/release-notes/<version>.md
 *   --repo    从 `git remote get-url origin` 推导
 *   --asset   无（本仓库产物由 CI 构建）
 *
 * 退出码：0 成功；1 失败；2 参数错误
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

function die (msg, code = 1) {
  console.error(`[err ] ${msg}`)
  process.exit(code)
}
const info = (m) => console.log(`[info] ${m}`)
const ok = (m) => console.log(`[ ok ] ${m}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------- 参数解析 ----------
const argv = process.argv.slice(2)
const version = argv.find((a) => !a.startsWith('--') && /^v\d/.test(a))
if (!version) die('缺少版本号，例：node publish-release.mjs v0.20.0-custom.2', 2)

const flags = {}
const assets = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--asset') {
    assets.push(argv[++i])
  } else if (a.startsWith('--')) {
    flags[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
}
const dryRun = Boolean(flags['dry-run'])
const bodyOnly = Boolean(flags['body-only'])
const noBody = Boolean(flags['no-body'])
const isPrerelease = Boolean(flags.prerelease)
const isDraft = Boolean(flags.draft)
const waitSeconds = Number(flags.wait ?? 0)
// --body-only 天然要求 release 已存在（CI 创建），给个宽容的默认等待时长
const waitMs = (!Number.isFinite(waitSeconds) ? 1800 : waitSeconds) * 1000

function resolveRepo () {
  if (typeof flags.repo === 'string') return flags.repo
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  if (!m) die(`无法从 origin（${url}）解析出 owner/repo，请用 --repo 指定`)
  return m[1]
}
const repo = resolveRepo()
const targetCommitish = typeof flags.target === 'string' ? flags.target : 'custom/main'

const notesFile = path.resolve(
  REPO_ROOT,
  typeof flags.notes === 'string' ? flags.notes : `CUSTOMIZATIONS/release-notes/${version}.md`
)
const assetPaths = assets.map((p) => path.resolve(REPO_ROOT, p))

// ---------- 前置校验 ----------
info(`仓库         : ${repo}`)
info(`版本         : ${version}`)
info(`release notes: ${notesFile}`)
for (const p of assetPaths) info(`产物         : ${p}`)
info(`模式         : ${bodyOnly ? '仅覆盖正文（--body-only）' : '创建/复用 release'}`)

if (!fs.existsSync(notesFile)) {
  die(`release notes 不存在：${notesFile}（先写 CUSTOMIZATIONS/release-notes/${version}.md）`)
}
const assetStats = assetPaths.map((p) => {
  if (!fs.existsSync(p)) die(`产物不存在：${p}`)
  return { path: p, name: path.basename(p), size: fs.statSync(p).size }
})

// 本地 tag 存在性与历史归属自检——发布事故多出于此（见 pitfalls 与 chatbox 经验）
try {
  const tagCommit = execFileSync('git', ['rev-parse', `${version}^{commit}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  info(`本地 tag     : ${tagCommit.slice(0, 8)}`)
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', version, 'HEAD'], { stdio: 'ignore' })
  } catch {
    console.warn(`[warn] ${version} 不是 HEAD 的祖先——tag 可能打在被 amend/改写过的提交上`)
  }
  try {
    execFileSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', version], { stdio: 'ignore' })
    ok('tag 已推送到 origin')
  } catch {
    console.warn(`[warn] origin 上还没有 tag ${version}，别忘了：git push origin ${version}`)
  }
} catch {
  console.warn(`[warn] 本地不存在 tag ${version}，先执行：git tag -a ${version} -m "Release ${version}"`)
}

if (dryRun) {
  console.log('\n[dry-run] 校验完成，未对 GitHub API 发起任何请求')
  process.exit(0)
}

// ---------- 取 token（GCM，不落盘） ----------
function getToken () {
  let out
  try {
    out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
    })
  } catch {
    die('无法从 Git Credential Manager 取到 github.com 凭证；可改用 `winget install GitHub.cli` + `gh auth login`')
  }
  const m = out.match(/^password=(.+)$/m)
  if (!m) die('GCM 返回的凭证里没有 password 字段（可能只存了用户名）')
  return m[1].trim()
}
const token = getToken()
ok('已从 Git Credential Manager 取到 token')

const api = `https://api.github.com/repos/${repo}`
const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'marktext-publish-script',
}
const body = fs.readFileSync(notesFile, 'utf8')

async function fetchRelease () {
  const res = await fetch(`${api}/releases/tags/${version}`, { headers })
  if (res.status === 200) return await res.json()
  if (res.status === 404) return null
  die(`查询 release 失败 ${res.status}：${await res.text()}`)
}

// ---------- 等待 release 出现（CI 创建） ----------
let release = await fetchRelease()
if (!release && (waitMs > 0 || bodyOnly)) {
  const deadline = waitMs > 0 ? waitMs : 0
  if (deadline > 0) {
    info(`release 尚未创建，等待 CI（最多 ${deadline / 1000}s，每 30s 轮询）...`)
    const start = Date.now()
    while (!release && Date.now() - start < deadline) {
      await sleep(30000)
      release = await fetchRelease()
      if (!release) info(`  仍在等待...（已 ${Math.round((Date.now() - start) / 1000)}s）`)
    }
  }
  if (!release) die(`等待超时，release ${version} 仍未出现；可稍后重跑本命令（幂等）`)
}

// ---------- 创建或复用 release ----------
if (!release) {
  const res = await fetch(`${api}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: version,
      target_commitish: targetCommitish,
      name: version,
      body,
      draft: isDraft,
      prerelease: isPrerelease,
    }),
  })
  if (!res.ok) die(`创建 release 失败 ${res.status}：${await res.text()}`)
  release = await res.json()
  ok(`release ${version} 已创建（id=${release.id}）`)
} else {
  info(`release ${version} 已存在（id=${release.id}），复用`)
  // 关键步骤：CI 会用自带模板重写正文（pitfalls #7），这里把正文改回我们的 notes
  if (!noBody) {
    const res = await fetch(`${api}/releases/${release.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: version, body, prerelease: isPrerelease, draft: isDraft }),
    })
    if (!res.ok) die(`更新 release 正文失败 ${res.status}：${await res.text()}`)
    release = await res.json()
    ok('release 正文已按 release notes 覆盖')
  }
}

// ---------- 上传产物 ----------
for (const asset of assetStats) {
  const dupe = (release.assets || []).find((a) => a.name === asset.name)
  if (dupe) {
    info(`资产 ${asset.name} 已存在（id=${dupe.id}），先删除旧资产再上传`)
    const del = await fetch(`${api}/releases/assets/${dupe.id}`, { method: 'DELETE', headers })
    if (!del.ok) die(`删除旧资产失败 ${del.status}：${await del.text()}`)
  }
  info(`上传 ${asset.name}（${(asset.size / 1024 / 1024).toFixed(1)} MB）...`)
  const up = await fetch(
    `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(asset.size),
        'User-Agent': 'marktext-publish-script',
      },
      body: fs.createReadStream(asset.path),
      duplex: 'half',
    }
  )
  if (!up.ok) die(`上传 ${asset.name} 失败 ${up.status}：${await up.text()}`)
  const upJson = await up.json()
  if (upJson.size !== asset.size) {
    die(`${asset.name} 上传后字节数不符：本地 ${asset.size}，远端 ${upJson.size}`)
  }
  ok(`${asset.name} 上传完成（${upJson.size} bytes，与本地一致）`)
}

// ---------- 核对最终状态 ----------
const final = await fetchRelease()
console.log('\n=== 远端 release 状态 ===')
console.log(`tag        : ${final.tag_name}`)
console.log(`draft      : ${final.draft}    prerelease: ${final.prerelease}`)
console.log(`assets     : ${(final.assets || []).length} 个`)
for (const a of final.assets || []) {
  console.log(`  - ${a.name}  ${a.size} bytes  ${a.state}`)
}
const notUploaded = (final.assets || []).filter((a) => a.state !== 'uploaded')
if (notUploaded.length) {
  console.warn(`\n[warn] ${notUploaded.length} 个资产不是 uploaded 状态：${notUploaded.map((a) => a.name).join(', ')}`)
}

console.log(`\n[SUCCESS] ${final.html_url}`)
