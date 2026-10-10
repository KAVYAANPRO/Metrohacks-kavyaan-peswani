@echo off
REM Double-click to start Yieldline: backend (:8000) and frontend (:5173), then open the browser.
start "Yieldline backend" cmd /k "cd /d %~dp0backend && npm run dev"
start "Yieldline frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 6 /nobreak >nul
start http://localhost:5173
