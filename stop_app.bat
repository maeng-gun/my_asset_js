@echo off
chcp 65001 > nul
echo MyAsset 백그라운드 서버를 종료합니다...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo 서버가 종료되었습니다.
timeout /t 2 >nul
