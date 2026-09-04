@echo off
REM Serves the app on http://localhost:8000 and opens it.
REM Preferred over double-clicking index.html: some browsers block fetch()
REM from file:// origins, which would break the Gemini calls.

cd /d "%~dp0"

if not exist config.js (
  echo config.js not found. Copying config.example.js so the app can start.
  copy config.example.js config.js >nul
  echo Paste your Gemini API key into config.js, then re-run this script.
)

where python >nul 2>nul
if errorlevel 1 (
  echo Python not found. Open index.html directly instead, or install Python.
  pause
  exit /b 1
)

start "" http://localhost:8000/index.html
python -m http.server 8000
