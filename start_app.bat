@echo off
chcp 65001 > nul
cd /d "%~dp0"
title MyAsset Desktop App

if exist "MyAsset.exe" (
    start "" "MyAsset.exe" %*
    exit /b 0
)

if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo MyAsset 데스크톱 래퍼를 실행합니다...
"%PYTHON_EXE%" desktop_tray_app.py %*
