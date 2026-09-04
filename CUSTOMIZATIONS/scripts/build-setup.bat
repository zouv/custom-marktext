@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem  marktext-custom - build NSIS Setup installer
rem  Output: dist\MarkText-<version>-Setup.exe (+ blockmap etc.)
rem          version comes from packages\desktop\package.json
rem  Usage:
rem    build-setup.bat               build + electron-builder NSIS
rem    build-setup.bat --skip-build  skip electron-vite build, package existing output
rem    build-setup.bat <extra args>  passed through to electron-builder
rem    (--skip-build may be combined; all other args go to electron-builder)
rem
rem  monorepo notes (differences vs chatbox version):
rem  - build runs at repo root: pnpm run build:win (minify-locales +
rem    electron-rebuild + electron-vite build + electron-builder).
rem  - electron-builder.yml lives in packages/desktop with
rem    directories.output=../../dist, so run builder with -C packages/desktop.
rem ============================================================

rem Project root: script lives at <repo>\CUSTOMIZATIONS\scripts\
set "ROOT=%~dp0..\.."
pushd "%ROOT%"

set "SKIP_BUILD="
set "EXTRA_ARGS="
if /I "%~1"=="--skip-build" (
  set "SKIP_BUILD=1"
  shift
)
:ParseArgs
if "%~1"=="" goto :ArgsDone
set "EXTRA_ARGS=%EXTRA_ARGS% %~1"
shift
goto :ParseArgs
:ArgsDone

rem Read version (packages/desktop/package.json version drives artifact names)
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw 'packages\desktop\package.json' | ConvertFrom-Json).version"`) do set "APP_VERSION=%%V"
if "%APP_VERSION%"=="" (
  echo [ERROR] Could not read version from packages\desktop\package.json.
  popd
  exit /b 1
)

echo ============================================================
echo  Build Setup  ^| project : %CD%
echo                version : %APP_VERSION%
echo                artifact: marktext-win-x64-%APP_VERSION%-setup.exe
echo                target  : NSIS win-x64
echo                output  : dist\
echo ============================================================

where pnpm >nul 2>&1
if errorlevel 1 goto :NoPnpm

rem 7za shim check (chatbox CUSTOM-20260902-003 experience): on machines
rem without symlink permission, extracting the winCodeSign cache aborts
rem packaging. Presence of 7za-real.exe means the shim is installed.
rem pnpm isolated layout may not expose 7zip-bin; builder falls back to its
rem own download/extract flow then (cache in LOCALAPPDATA\electron-builder).
set "SEVENZIP_DIR=packages\node_modules\7zip-bin\win\x64"
if not exist "%SEVENZIP_DIR%" set "SEVENZIP_DIR=node_modules\7zip-bin\win\x64"
if not exist "%SEVENZIP_DIR%\7za-real.exe" (
  if exist "%SEVENZIP_DIR%\7za.exe" (
    if exist "CUSTOMIZATIONS\scripts\7za-shim.exe" (
      echo [INFO] installing 7za shim...
      move /Y "%SEVENZIP_DIR%\7za.exe" "%SEVENZIP_DIR%\7za-real.exe" >nul
      copy /Y "CUSTOMIZATIONS\scripts\7za-shim.exe" "%SEVENZIP_DIR%\7za.exe" >nul
    ) else (
      echo [WARN] 7za shim missing; if packaging fails during winCodeSign extraction, install it per CUSTOMIZATIONS/docs/pitfalls.md.
    )
  ) else (
    echo [INFO] 7zip-bin not exposed by pnpm layout; relying on electron-builder own extract.
  )
) else (
  echo [INFO] 7za shim already installed.
)

rem Kill resident instances so output files are not locked
echo Stopping any running MarkText instances...
taskkill /IM "MarkText.exe" /F >nul 2>&1
taskkill /IM "marktext.exe" /F >nul 2>&1

if not "%SKIP_BUILD%"=="1" (
  echo.
  echo [1/2] Building ^+ minify-locales ^+ electron-rebuild ...
  call pnpm run build:win:x64
  if errorlevel 1 goto :BuildFailed
) else (
  echo.
  echo [1/2] Skipping build ^(--skip-build^). Re-running builder only...
)

echo.
echo [2/2] electron-builder NSIS ...
rem Retry loop (chatbox CUSTOM-20260903-009 experience): antivirus scans
rem the freshly written exe and briefly locks it; rcedit then fails with
rem "Unable to commit changes". electron-builder's 3 quick retries fall
rem inside the scan window, so retry the whole builder run with a backoff.
set "EB_TRIES=0"
:PackageRun
call npx electron-builder build --publish never --win --x64 --projectDir packages\desktop %EXTRA_ARGS%
if not errorlevel 1 goto :PackageDone
set /a EB_TRIES+=1
if %EB_TRIES% GEQ 3 goto :PackageFailed
echo [WARN] electron-builder failed ^(try %EB_TRIES%/3^). Antivirus may be scanning the output; waiting 15s before retry...
timeout /t 15 /nobreak >nul
goto :PackageRun
:PackageDone

echo.
echo ============================================================
echo  Output:
echo ============================================================
set "FOUND_SETUP="
for %%F in ("dist\marktext-win-x64-%APP_VERSION%-setup.exe") do (
  echo   setup : %%~fF
  echo   size  : %%~zF bytes
  set "FOUND_SETUP=1"
)
if not defined FOUND_SETUP (
  echo   [WARN] dist\marktext-win-x64-%APP_VERSION%-setup.exe not found
  echo   listing dist\*.exe :
  dir /b "dist\*.exe" 2>nul
)

echo.
echo [SUCCESS] Setup build finished.
echo   Use the marktext-release skill for a full GitHub release.
popd
exit /b 0

:NoPnpm
echo [ERROR] pnpm CLI not found. Install Node.js ^>=20.19 and pnpm ^>=10 first.
popd
exit /b 1

:BuildFailed
echo.
echo [FAILED] pnpm run build:win:x64 failed.
popd
exit /b 1

:PackageFailed
echo.
echo [FAILED] electron-builder packaging failed.
popd
exit /b 1
