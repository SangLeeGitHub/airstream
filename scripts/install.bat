@echo off
echo ========================================
echo   AirStream - Installation
echo ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install from https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found:
node --version

:: Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg not found. Please install from https://ffmpeg.org and add to PATH.
    pause
    exit /b 1
)
echo [OK] FFmpeg found:
ffmpeg -version 2>&1 | findstr /C:"ffmpeg version"

:: Install npm dependencies
echo.
echo Installing dependencies...
cd /d "%~dp0.."
npm install

echo.
echo ========================================
echo   Installation complete!
echo   Run: npm start
echo ========================================
pause
