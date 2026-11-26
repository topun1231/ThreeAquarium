@echo off
chcp 65001 >nul
title ThreeAquarium - Wallpaper
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-wallpaper.ps1"
if errorlevel 1 pause
