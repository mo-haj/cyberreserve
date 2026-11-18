@echo off
setlocal EnableDelayedExpansion
rem Uploads this folder to a GitHub repository named cyberreserve (private by default), under the
rem GitHub account gh is signed in with. Options: push-github.bat [account] [public]
rem   push-github.bat mo-haj public   = public repository under mo-haj
rem Run it again any time to upload the latest changes.
rem .env (your bot token and passwords), backups and node_modules are never uploaded (.gitignore).
cd /d "%~dp0"

where git >nul 2>nul || (echo Git is not installed. Get it from https://git-scm.com/download/win & pause & exit /b 1)
where gh  >nul 2>nul || (echo GitHub CLI is not installed. Get it from https://cli.github.com & pause & exit /b 1)

gh auth status >nul 2>nul || (
  echo You are not signed in to GitHub. A browser window will open to sign in.
  gh auth login --web --git-protocol https || (pause & exit /b 1)
)
gh auth setup-git >nul 2>nul

for /f "delims=" %%u in ('gh api user -q .login') do set LOGIN=%%u
set OWNER=%~1
if "%OWNER%"=="" set OWNER=%LOGIN%
set REPO=%OWNER%/cyberreserve
set VIS=private
if /i "%~2"=="public" set VIS=public
echo Signed in to GitHub as: %LOGIN%
echo Uploading to:           %REPO% (%VIS%)
echo To use another account: close this, run "gh auth login", then run this again.
echo.

if not exist .git (
  echo Creating the local repository...
  git init -b main || (pause & exit /b 1)
)

rem Name and e-mail for the commits, if Git has none yet: your GitHub name.
git config user.name >nul 2>nul || (
  for /f "delims=" %%u in ('gh api user -q .login') do (
    git config user.name "%%u"
    git config user.email "%%u@users.noreply.github.com"
  )
)

git add -A || (pause & exit /b 1)

rem Safety: stop if a secret file was picked up.
for %%f in (.env .env.local .env.production) do (
  git ls-files --cached --error-unmatch "%%f" >nul 2>nul && (
    echo STOP: %%f would be uploaded. It holds your secrets. Removing it from the upload.
    git rm --cached --quiet "%%f"
    echo Nothing was uploaded. Check .gitignore, then run this again.
    pause & exit /b 1
  )
)

rem Safety: stop if a bot token, private key or real database password is in any file.
git grep --cached -qE "[0-9]{8,10}:[A-Za-z0-9_-]{35}|BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[a-z0-9_]+:[A-Za-z0-9]{16,}@" && (
  echo STOP: a file looks like it contains a secret:
  git grep --cached -nE "[0-9]{8,10}:[A-Za-z0-9_-]{35}|BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[a-z0-9_]+:[A-Za-z0-9]{16,}@"
  git reset -q
  echo Nothing was uploaded. Remove the secret from that file, then run this again.
  pause & exit /b 1
)

git diff --cached --quiet && (echo No new changes to commit.) || (
  git commit -q -m "Update %date% %time:~0,5%" || (pause & exit /b 1)
)

gh repo view %REPO% >nul 2>nul
if errorlevel 1 (
  echo Creating the %VIS% repository %REPO% on GitHub...
  gh repo create %REPO% --%VIS% --source . --remote origin --push || (pause & exit /b 1)
) else (
  git remote get-url origin >nul 2>nul || git remote add origin https://github.com/%REPO%.git
  git push -u origin main || (pause & exit /b 1)
)

echo.
echo Done: https://github.com/%REPO%  (%VIS%)
pause
