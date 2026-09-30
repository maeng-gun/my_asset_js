@echo off
chcp 65001 > nul
cd /d "%~dp0"
title MyAsset 데스크톱 환경 원클릭 자동 셋업

echo ======================================================
echo       MyAsset 데스크톱 앱 원클릭 환경 구축 시작
echo ======================================================
echo.

:: 1. Python 설치 확인
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python 3.10 이상이 설치되어 있지 않거나 PATH에 등록되지 않았습니다.
    echo https://www.python.org/downloads/ 에서 Python을 설치(Add python.exe to PATH 체크)해 주세요.
    echo.
    pause
    exit /b 1
)
echo [확인] Python 환경이 확인되었습니다.

:: 2. .env.local 확인 경고
if not exist ".env.local" (
    echo.
    echo [주의] .env.local 파일이 존재하지 않습니다!
    echo 보안상 .env.local은 Git에 포함되지 않으므로, 기존 PC에서 .env.local을 복사해 넣으셔야 정상 작동합니다.
    echo (셋업 완료 후 나중에 넣으셔도 무방합니다.)
    echo.
)

:: 3. Python 가상환경(.venv) 생성
if not exist ".venv\Scripts\python.exe" (
    echo [1/5] Python 가상환경(.venv)을 생성합니다...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [오류] 가상환경 생성에 실패했습니다.
        pause
        exit /b 1
    )
) else (
    echo [1/5] 기존 Python 가상환경(.venv)을 확인했습니다.
)

:: 4. Python 데스크톱 패키지 설치
echo [2/5] 데스크톱 필수 라이브러리(pywebview, pystray 등)를 설치합니다...
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
if %errorlevel% neq 0 (
    echo [오류] Python 의존성 설치에 실패했습니다.
    pause
    exit /b 1
)

:: 5. Node.js 의존성 설치 (npm install)
echo [3/5] Node.js 패키지 의존성을 설치합니다...
call npm.cmd install
if %errorlevel% neq 0 (
    echo [오류] npm install 에 실패했습니다. Node.js가 설치되어 있는지 확인해 주세요.
    pause
    exit /b 1
)

:: 6. Next.js 프로덕션 빌드 (npm run build)
echo [4/5] Next.js 프로덕션 빌드를 수행합니다...
call npm.cmd run build
if %errorlevel% neq 0 (
    echo [오류] Next.js 빌드에 실패했습니다.
    pause
    exit /b 1
)

:: 7. 독립 실행 바이너리(MyAsset.exe) 및 바로가기 자동 등록
echo [5/5] 데스크톱 앱(MyAsset.exe) 및 바로가기를 등록합니다...
powershell -NoProfile -ExecutionPolicy Bypass -File "create_shortcut.ps1"
MyAsset.exe --register-startup

echo.
echo ======================================================
echo   🎉 MyAsset 데스크톱 앱 환경 구축이 완료되었습니다!
echo   - 실행 파일: MyAsset.exe (20MB 독립 실행 바이너리)
echo   - 바탕화면 바로가기: MyAsset.lnk
echo   - 부팅 시 자동 시작 등록 완료 (트레이 무음 상주 모드)
echo ======================================================
echo.
pause
