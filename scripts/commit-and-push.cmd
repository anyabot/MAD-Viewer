@echo off
if "%~1"=="" (
  echo Usage: commit-and-push.cmd "commit message"
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0commit-and-push.ps1" %*
