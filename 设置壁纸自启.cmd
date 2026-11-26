@echo off
chcp 65001 >nul
title ThreeAquarium - Wallpaper Startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-wallpaper.ps1" -ConfigureStartup
pause
