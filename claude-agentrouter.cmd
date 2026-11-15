@echo off
call bun "%~dp0scripts\start.ts" %*
exit /b %errorlevel%
