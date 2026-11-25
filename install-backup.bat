@echo off
rem Moves the daily R2 backup workflow into place (one time). Then run push-github.bat.
cd /d "%~dp0"
if not exist backup.yml.txt (echo backup.yml.txt not found - already moved? & pause & exit /b 1)
if not exist .github\workflows mkdir .github\workflows
move /y backup.yml.txt .github\workflows\backup.yml
echo Done: .github\workflows\backup.yml
pause
