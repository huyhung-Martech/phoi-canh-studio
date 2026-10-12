@echo off
rem Tool chay trong trinh duyet nhung can may chu cuc bo (trinh duyet chan mo module JS truc tiep tu file)
cd /d "%~dp0"
rem Mo trinh duyet sau 2 giay de may chu kip khoi dong
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5180/tool/"
echo Phoi Canh Studio dang chay. Dong cua so nay de tat tool.
py -3.12 -m http.server 5180 --bind 127.0.0.1
