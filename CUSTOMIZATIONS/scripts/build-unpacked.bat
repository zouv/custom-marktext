@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem  marktext-custom - build unpacked (portable) package
rem  Output: dist\win-unpacked\ (win-x64)
rem  Usage:
rem    build-unpacked.bat            build + electron-builder --dir
rem    build-unpacked.bat --skip-build  skip electron-vite build, package existing output
rem    build-unpacked.bat <extra args>   passed through to electron-builder
rem    (--skip-build may be combined; all other args go to electron-builder)
rem
rem  monorepo notes (differences vs chatbox version):
rem  - build runs at repo root: pnpm run build:unpack proxies to
rem    packages/desktop (electron-vite build) and includes minify-locales.
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

echo ============================================================
echo  Build unpacked ^| project : %CD%
echo                     output : dist\win-unpacked\
echo                     mode   : electron-builder --dir
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
  echo [1/2] Building main + preload + renderer ^(+ minify-locales^)...
  call pnpm run build:unpack
  if errorlevel 1 goto :BuildFailed
) else (
  echo.
  echo [1/2] Skipping build ^(--skip-build^).
)

echo.
echo [2/2] electron-builder --dir ...
rem Retry loop (chatbox CUSTOM-20260903-009 experience): antivirus scans
rem the freshly written exe and briefly locks it; rcedit then fails with
rem "Unable to commit changes". electron-builder's 3 quick retries fall
rem inside the scan window, so retry the whole builder run with a backoff.
set "EB_TRIES=0"
:PackageRun
call npx electron-builder build --publish never --dir --win --projectDir packages\desktop %EXTRA_ARGS%
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
if exist "dist\win-unpacked\marktext.exe" (
  echo   win-unpacked : %CD%\dist\win-unpacked\marktext.exe
) else (
  echo   [WARN] dist\win-unpacked\marktext.exe not found
)

echo.
echo [SUCCESS] unpacked build finished.
popd
exit /b 0

:NoPnpm
echo [ERROR] pnpm CLI not found. Install Node.js ^>=20.19 and pnpm ^>=10 first.
popd
exit /b 1

:BuildFailed
echo.
echo [FAILED] pnpm run build:unpack failed.
popd
exit /b 1

:PackageFailed
echo.
echo [FAILED] electron-builder packaging failed.
popd
exit /b 1
