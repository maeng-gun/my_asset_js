$WshShell = New-Object -ComObject WScript.Shell

$appDir = $PSScriptRoot
if (-not $appDir) { $appDir = (Get-Location).Path }
$vbsPath = "$appDir\start_silent.vbs"
$icoPath = "$appDir\app_icon.ico"
$wscriptExe = "$env:SystemRoot\System32\wscript.exe"

$s1 = $WshShell.CreateShortcut("$appDir\MyAsset.lnk")
$s1.TargetPath = $wscriptExe
$s1.Arguments = "`"$vbsPath`""
$s1.WorkingDirectory = $appDir
$s1.IconLocation = $icoPath
$s1.Save()

$desktop = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$s2 = $WshShell.CreateShortcut("$desktop\MyAsset.lnk")
$s2.TargetPath = $wscriptExe
$s2.Arguments = "`"$vbsPath`""
$s2.WorkingDirectory = $appDir
$s2.IconLocation = $icoPath
$s2.Save()

Write-Output "Silent shortcuts created successfully!"
