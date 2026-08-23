Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = appDir

' 1. Next.js 개발 서버를 백그라운드 무창(창 숨김: 0) 모드로 실행
WshShell.Run "cmd.exe /c npm run dev", 0, False

' 2. 서버가 뜰 때까지 3초 대기
WScript.Sleep 3000

' 3. 기본 웹 브라우저로 http://localhost:3000 오픈
WshShell.Run "http://localhost:3000", 1, False
