$WshShell = New-Object -ComObject WScript.Shell

$appDir = $PSScriptRoot
if (-not $appDir) { $appDir = (Get-Location).Path }

$myAssetExe = "$appDir\MyAsset.exe"
$icoPath = "$appDir\app_icon.ico"
$pythonExe = "$appDir\.venv\Scripts\python.exe"

# 1. MyAsset.exe 바이너리가 없으면 PyInstaller로 빌드
if ((-not (Test-Path $myAssetExe)) -and (Test-Path $pythonExe)) {
    Write-Output "MyAsset.exe PyInstaller 경량 빌드 수행 중..."
    & $pythonExe -m PyInstaller --name "MyAsset" --onefile --noconsole --icon "app_icon.ico" --add-data "app_icon.ico;." --exclude-module tkinter --exclude-module unittest --exclude-module test --exclude-module xmlrpc --exclude-module pydoc --exclude-module sqlite3 --exclude-module multiprocessing --clean "$appDir\desktop_tray_app.py"
    if (Test-Path "$appDir\dist\MyAsset.exe") {
        Move-Item -Path "$appDir\dist\MyAsset.exe" -Destination $myAssetExe -Force
        Remove-Item -Path "$appDir\dist", "$appDir\build", "$appDir\MyAsset.spec" -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 프로젝트 루트 폴더의 중복 바로가기는 정리(실행 파일 MyAsset.exe가 이미 존재함)
if (Test-Path "$appDir\MyAsset.lnk") {
    Remove-Item "$appDir\MyAsset.lnk" -Force -ErrorAction SilentlyContinue
}

$desktop = [System.Environment]::GetFolderPath("Desktop")
$programs = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
$taskbarDir = "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"

$shortcutTargets = @(
    "$desktop\MyAsset.lnk",
    "$programs\MyAsset.lnk"
)

foreach ($linkPath in $shortcutTargets) {
    $s = $WshShell.CreateShortcut($linkPath)
    $s.TargetPath = $myAssetExe
    $s.Arguments = ""
    $s.WorkingDirectory = $appDir
    $s.IconLocation = "$myAssetExe,0"
    $s.Save()
}

# 2. 작업표시줄 고정 폴더 내 바로가기 갱신
if (Test-Path $taskbarDir) {
    if (Test-Path "$taskbarDir\Python.lnk") {
        Remove-Item "$taskbarDir\Python.lnk" -Force -ErrorAction SilentlyContinue
    }
    $s4 = $WshShell.CreateShortcut("$taskbarDir\MyAsset.lnk")
    $s4.TargetPath = $myAssetExe
    $s4.Arguments = ""
    $s4.WorkingDirectory = $appDir
    $s4.IconLocation = "$myAssetExe,0"
    $s4.Save()
}

# 3. 윈도우 셸 아이콘 캐시 새로고침 알림
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellNotifier {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@ -ErrorAction SilentlyContinue
[ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Output "MyAsset.exe 및 바로가기 환경 설정 완료!"
Write-Output "실행 파일: $myAssetExe"
Write-Output "바탕화면: $desktop\MyAsset.lnk"
Write-Output "시작 메뉴: $programs\MyAsset.lnk"
