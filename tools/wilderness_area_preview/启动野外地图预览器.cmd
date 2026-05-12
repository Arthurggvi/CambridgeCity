@echo off
setlocal

cd /d "%~dp0"

REM 如果脚本位于 tools\wilderness_area_preview，则回到仓库根目录
if exist "..\..\package.json" (
  cd /d "..\.."
)

echo.
echo ==========================================
echo  CambridgeCity - Wilderness author server
echo ==========================================
echo.
echo Starting/opening author server...
echo.
REM Start a detached watcher BEFORE node server.
REM It polls 5588..5592 and opens exactly one ready author-server URL.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "$ports=5588,5589,5590,5591,5592; " ^
  "$opened=$false; " ^
  "for($i=0; $i -lt 60 -and -not $opened; $i++){ " ^
  "  foreach($p in $ports){ " ^
  "    try { " ^
  "      $r=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$p+'/api/health') -TimeoutSec 1; " ^
  "      if($r.service -eq 'wilderness_area_preview_author_server'){ " ^
  "        Start-Process ('http://127.0.0.1:'+$p+'/'); " ^
  "        $opened=$true; break; " ^
  "      } " ^
  "    } catch {} " ^
  "  } " ^
  "  if(-not $opened){ Start-Sleep -Milliseconds 500 } " ^
  "}"

npm run wilderness:area-preview -- --area west2_old_marker_patrol_line --export --no-open

echo.
echo Author server exited.
pause

