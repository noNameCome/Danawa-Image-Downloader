@echo off
echo 다나와 이미지 다운로더 확장 프로그램 패키징

REM Chrome 실행 파일 경로 설정
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

REM 확장 프로그램 소스 폴더 경로
set EXT_DIR=%~dp0extension

REM 출력 폴더 생성
mkdir output 2>nul

REM 확장 프로그램 패키징
%CHROME% --pack-extension="%EXT_DIR%" --pack-extension-key="%~dp0extension.pem"

REM 생성된 .crx 파일을 output 폴더로 이동
move "%EXT_DIR%.crx" "output\다나와_이미지_다운로더.crx"

echo 패키징이 완료되었습니다.
echo 생성된 파일: output\다나와_이미지_다운로더.crx
pause 