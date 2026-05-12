@echo off
setlocal

cd /d "%~dp0"

REM If script is under tools\wilderness_area_preview, go to repo root
if exist "..\..\package.json" (
  cd /d "..\.."
)

echo.
echo ==========================================
echo  Cambridge City - Wilderness Area Preview
echo ==========================================
echo.
echo Generating index.html, starting author server, opening browser...
echo Do not use live-server 5500 or file:// for one-click apply.
echo If browser does not open, use the printed http://127.0.0.1:xxxx/ URL.
echo Close this window to stop the server.
echo.

npm run wilderness:area-preview

echo.
echo Author server exited.
pause

