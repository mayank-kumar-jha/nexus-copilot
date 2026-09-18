@echo off
title AI Browser Agent - Server & Floating App
cd /d "c:\Users\saket\OneDrive\Desktop\interview practice\backend"
echo ======================================================
echo   STARTING AI BROWSER AGENT (FLOATING CAPSULE MODE)
echo ======================================================
echo.
echo 1. Launching backend server on port 3000...
echo 2. Opening floating desktop capsule widget...
echo.

:: Launch isolated floating spotlight widget without tabs, titlebars or URL bars
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --user-data-dir="%TEMP%\ai-agent-app" --window-size=680,240 --window-position=420,90 2>nul || start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --user-data-dir="%TEMP%\ai-agent-app" --window-size=680,240 --window-position=420,90 2>nul || start msedge --app=http://localhost:3000 --user-data-dir="%TEMP%\ai-agent-app" --window-size=680,240 --window-position=420,90 2>nul || start http://localhost:3000

node src/server.js
pause
