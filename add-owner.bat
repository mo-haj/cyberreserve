@echo off
rem Makes a player the owner (or staff) of an arena, so they can open the
rem owner panel at /manage. The player must have signed in once with Telegram.
cd /d "%~dp0"
echo Arenas:
docker compose exec -T web node node_modules/tsx/dist/cli.mjs scripts/add-owner.ts
echo.
set /p SLUG=Arena (copy a name from the list above): 
set /p PHONE=Player's phone (e.g. 0944123456 or +963944123456): 
set /p ROLE=Role - OWNER, STAFF or REMOVE [OWNER]: 
if "%ROLE%"=="" set ROLE=OWNER
docker compose exec -T web node node_modules/tsx/dist/cli.mjs scripts/add-owner.ts %SLUG% %PHONE% %ROLE%
pause
