@echo off
echo Stopping MyAsset Desktop App and Server...

REM 1. Call graceful shutdown API
curl.exe -s -X POST http://127.0.0.1:3000/api/system/shutdown >nul 2>&1

REM 2. Kill listening port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

REM 3. Kill python desktop tray app processes
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*desktop_tray_app.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo All MyAsset processes stopped successfully.
ping 127.0.0.1 -n 2 >nul
