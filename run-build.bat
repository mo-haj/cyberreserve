@echo off
rem Builds and starts CyberReserve, and saves everything to run-report.log
rem so the result can be read afterwards. Double-click it, or run it from a terminal.
cd /d "%~dp0"
set LOG=run-report.log

echo ==== %DATE% %TIME% ==== > %LOG%
echo [1/6] Building the image (first time can take several minutes)...
echo ==== BUILD ==== >> %LOG%
docker compose --progress plain build web >> %LOG% 2>&1
if errorlevel 1 (
  echo BUILD FAILED. See run-report.log
  echo ==== BUILD FAILED ==== >> %LOG%
  goto :end
)

echo [2/6] Starting containers...
echo ==== UP ==== >> %LOG%
docker compose up -d >> %LOG% 2>&1

echo [3/6] Waiting 60 seconds for the site to become healthy...
timeout /t 60 /nobreak > nul

echo [4/6] Collecting status...
echo ==== PS ==== >> %LOG%
docker compose ps >> %LOG% 2>&1
echo ==== HEALTH ==== >> %LOG%
curl -s -m 10 http://localhost:3000/api/health >> %LOG% 2>&1
echo. >> %LOG%
echo ==== ADMIN (expect 403) ==== >> %LOG%
curl -s -m 10 -o nul -w "%%{http_code}" http://localhost:3000/admin >> %LOG% 2>&1
echo. >> %LOG%
echo ==== WEB LOGS ==== >> %LOG%
docker compose logs --no-color --tail 80 web >> %LOG% 2>&1
echo ==== BACKUP LOGS ==== >> %LOG%
docker compose logs --no-color --tail 20 db-backup >> %LOG% 2>&1

echo [5/6] Running the full checklist (needs Git Bash)...
echo ==== VERIFY ==== >> %LOG%
set BASH_EXE=
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "BASH_EXE=%LocalAppData%\Programs\Git\bin\bash.exe"
if defined BASH_EXE (
  "%BASH_EXE%" scripts/verify.sh --restart >> %LOG% 2>&1
) else (
  echo Git Bash not found - checklist skipped >> %LOG%
)

echo [6/6] Telegram sign-in helper...
echo ==== TELEGRAM ==== >> %LOG%
findstr /r /c:"^TELEGRAM_BOT_TOKEN=..*" .env >nul
if errorlevel 1 (
  echo No TELEGRAM_BOT_TOKEN in .env - Telegram sign-in stays off. >> %LOG%
) else (
  docker compose --profile telegram up -d telegram-poller >> %LOG% 2>&1
  timeout /t 15 /nobreak > nul
  docker compose --profile telegram logs --no-color --tail 20 telegram-poller >> %LOG% 2>&1
)

:end
echo ==== DONE %DATE% %TIME% ==== >> %LOG%
echo.
echo Finished. Results are in run-report.log
pause
