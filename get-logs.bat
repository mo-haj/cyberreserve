@echo off
rem Saves the recent logs of the website and the Telegram helper to logs.txt,
rem plus a test of whether the containers can reach Telegram.
rem (No passwords or tokens are written to these logs.)
cd /d "%~dp0"
echo ==== %DATE% %TIME% ==== > logs.txt
echo ==== CAN THE SITE REACH TELEGRAM? ==== >> logs.txt
docker compose exec -T web node -e "require('dns').promises.lookup('api.telegram.org').then(a=>console.log('DNS ok',a.address)).catch(e=>console.log('DNS FAILED',e.code)).then(()=>fetch('https://api.telegram.org',{signal:AbortSignal.timeout(10000)})).then(r=>console.log('HTTPS ok',r.status)).catch(e=>console.log('HTTPS FAILED',(e.cause&&e.cause.code)||e.message))" >> logs.txt 2>&1
echo ==== WEB ==== >> logs.txt
docker compose logs --no-color --tail 300 web >> logs.txt 2>&1
echo ==== TELEGRAM HELPER ==== >> logs.txt
docker compose --profile telegram logs --no-color --tail 100 telegram-poller >> logs.txt 2>&1
echo Done. Logs saved to logs.txt
pause
