#!/usr/bin/env bash
# =============================================================================
# manager.sh — marktext-custom 项目统一入口
# Windows 使用 Git Bash 执行：sh CUSTOMIZATIONS/scripts/manager.sh <command>
#
# 常用快捷写法（在仓库根目录）：
#   sh CUSTOMIZATIONS/scripts/manager.sh help
#   sh CUSTOMIZATIONS/scripts/manager.sh unpacked
#   sh CUSTOMIZATIONS/scripts/manager.sh setup
# =============================================================================
set -euo pipefail

# 项目根目录：脚本位于 <repo>/CUSTOMIZATIONS/scripts/ 下
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="${PROJECT_ROOT}/CUSTOMIZATIONS/scripts"
DIST_DIR="${PROJECT_ROOT}/dist"
OUT_DIR="${PROJECT_ROOT}/packages/desktop/out"

log()  { printf "\033[1;34m[manager]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ ok  ]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[err  ]\033[0m %s\n" "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "缺少命令：$1"
    exit 1
  }
}

# 进入项目根目录执行所有命令，避免相对路径歧义
cd "${PROJECT_ROOT}"

# -----------------------------------------------------------------------------
# 7za shim 状态检查（CUSTOM-20260902-003，chatbox 项目经验移植）
# electron-builder 经 app-builder.exe 用 SZA_PATH（node_modules/7zip-bin 的
# 7za.exe）解压 winCodeSign 等 .7z 工具缓存；Windows 无 symlink 权限的机器
# 上解压含 darwin dylib symlink 的缓存会失败。shim 转调真实 7za 并补齐
# dylib 副本。pnpm install 会重置 node_modules，之后需重装 shim。
# 7zip-bin 由 electron-builder 的 builder-util 依赖，位于
# packages/desktop/node_modules（pnpm 隔离布局下可能不存在，此时先跑
# pnpm install；解压仍失败再装 shim）。
# -----------------------------------------------------------------------------
sevenzip_dir() {
  local d="${PROJECT_ROOT}/packages/desktop/node_modules/7zip-bin/win/x64"
  [ -d "$d" ] || d="${PROJECT_ROOT}/node_modules/7zip-bin/win/x64"
  echo "$d"
}

ensure_7za_shim() {
  local dir
  dir="$(sevenzip_dir)"
  if [ -f "${dir}/7za-real.exe" ]; then
    ok "7za shim 已安装（${dir}）"
    return 0
  fi
  if [ ! -f "${dir}/7za.exe" ]; then
    # pnpm 严格隔离布局下 7zip-bin 可能不在可寻址路径；此时交给 electron-builder
    # 自身的下载/解压流程处理（缓存位于 %LOCALAPPDATA%\electron-builder\Cache）
    warn "未找到 ${dir}/7za.exe（pnpm 布局未暴露 7zip-bin）——跳过 shim，如解压失败再处理"
    return 0
  fi
  warn "7za shim 未安装，正在安装（pnpm install 后需重做）..."
  if [ ! -f "${SCRIPTS_DIR}/7za-shim.exe" ]; then
    err "缺少 ${SCRIPTS_DIR}/7za-shim.exe，需先编译：csc -out:CUSTOMIZATIONS\\scripts\\7za-shim.exe CUSTOMIZATIONS\\scripts\\7za-shim.cs"
    exit 1
  fi
  mv "${dir}/7za.exe" "${dir}/7za-real.exe"
  cp "${SCRIPTS_DIR}/7za-shim.exe" "${dir}/7za.exe"
  ok "7za shim 安装完成"
}

# 结束可能驻留后台的 MarkText 实例，否则打包产物被占用会失败
kill_running_marktext() {
  log "结束正在运行的 MarkText 实例..."
  taskkill //F //IM "MarkText.exe" >/dev/null 2>&1 || true
  taskkill //F //IM "marktext.exe" >/dev/null 2>&1 || true
}

cmd_install() {
  require_cmd pnpm
  log "安装依赖（pnpm install，自动跑 postinstall：patch/electron 下载/原生重建/locales 压缩）"
  pnpm install
  ensure_7za_shim
  ok "依赖安装完成"
}

cmd_dev() {
  require_cmd pnpm
  log "启动开发模式（renderer 热重载；改 main/ 需重启）"
  pnpm run dev "$@"
}

cmd_build() {
  require_cmd pnpm
  log "快速构建验证（electron-vite build，不打包）"
  pnpm run build:unpack "$@"
  ok "构建完成（产物 ${OUT_DIR}/）"
}

cmd_lint() {
  require_cmd pnpm
  log "ESLint 代码检查"
  pnpm run lint "$@"
  log "typecheck（vue-tsc）"
  pnpm run typecheck
  ok "检查完成"
}

cmd_test() {
  require_cmd pnpm
  log "运行测试（vitest，packages/desktop）"
  pnpm run test "$@"
  ok "测试完成"
}

# unpacked 包：构建 + electron-builder（--dir），产物为 dist/win-unpacked/
cmd_unpacked() {
  require_cmd pnpm
  ensure_7za_shim
  kill_running_marktext
  log "打包 unpacked 目录包（bat）"
  cmd //c "$(cygpath -w "${SCRIPTS_DIR}/build-unpacked.bat" 2>/dev/null || echo "${SCRIPTS_DIR}/build-unpacked.bat")"
  ok "unpacked 打包完成：${DIST_DIR}/win-unpacked/"
}

# Setup 包：构建 + electron-builder（NSIS），产物为 dist/marktext-win-x64-<版本>-setup.exe
cmd_setup() {
  require_cmd pnpm
  ensure_7za_shim
  kill_running_marktext
  log "打包 NSIS Setup 安装包（bat）"
  cmd //c "$(cygpath -w "${SCRIPTS_DIR}/build-setup.bat" 2>/dev/null || echo "${SCRIPTS_DIR}/build-setup.bat")"
  ok "Setup 打包完成，见 ${DIST_DIR}/"
}

# 汇总当前打包产物
cmd_artifacts() {
  if [ ! -d "${DIST_DIR}" ]; then
    warn "尚无打包产物（${DIST_DIR} 不存在）"
    return 0
  fi
  log "当前打包产物（${DIST_DIR}）："
  local found=0
  for f in "${DIST_DIR}"/*.exe "${DIST_DIR}"/*.zip "${DIST_DIR}"/*.blockmap "${DIST_DIR}"/*.yml; do
    [ -f "$f" ] || continue
    found=1
    printf "  %s  (%s bytes)\n" "$(basename "$f")" "$(stat -c %s "$f" 2>/dev/null || wc -c < "$f" | tr -d ' ')"
  done
  for d in "${DIST_DIR}"/*-unpacked; do
    [ -d "$d" ] || continue
    found=1
    printf "  %s/  (目录包)\n" "$(basename "$d")"
  done
  [ "$found" = 0 ] && warn "产物目录为空"
}

cmd_clean() {
  log "清理构建与打包产物"
  rm -rf "${PROJECT_ROOT}/dist" "${PROJECT_ROOT}/packages/desktop/out"
  ok "清理完成"
}

cmd_help() {
  cat <<'EOF'
marktext-custom — manager.sh

用法：
  sh CUSTOMIZATIONS/scripts/manager.sh <command> [args]

命令：
  install [args]  安装依赖并装好 7za shim（pnpm install）
  dev    [args]   启动开发模式（热重载）
  build  [args]   快速构建验证（build:unpack，产物 packages/desktop/out/）
  lint   [args]   ESLint + typecheck
  test   [args]   运行测试（vitest）
  unpacked        构建 + 打包 unpacked 目录包（免安装，dist/win-unpacked/）
  setup           构建 + 打包 NSIS Setup 安装包（dist/marktext-win-x64-<版本>-setup.exe）
  artifacts       列出当前打包产物
  clean           清理构建、打包产物
  help            显示帮助

说明：
  - unpacked/setup 会自动：检查/安装 7za shim、结束运行中的 MarkText.exe。
  - 正式发布（GitHub Release、版本号管理）请用 marktext-release skill，
    本脚本只负责本地打包。
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "${cmd}" in
    install) cmd_install "$@" ;;
    dev|start) cmd_dev "$@" ;;
    build) cmd_build "$@" ;;
    lint|check) cmd_lint "$@" ;;
    test) cmd_test "$@" ;;
    unpacked|dir) cmd_unpacked ;;
    setup|installer) cmd_setup ;;
    artifacts|ls) cmd_artifacts ;;
    clean) cmd_clean ;;
    help|-h|--help) cmd_help ;;
    *) err "未知命令：${cmd}"; cmd_help; exit 2 ;;
  esac
}

main "$@"
