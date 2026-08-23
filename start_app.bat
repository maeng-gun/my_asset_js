@echo off
cd /d "%~dp0"
title MyAsset Portfolio
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
npm run dev
