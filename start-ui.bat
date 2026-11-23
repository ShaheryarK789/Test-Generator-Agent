@echo off
title QaseGenAI
cd /d "%~dp0"
if not exist "web\node_modules" (cd web && call npm install && cd ..)
if not exist ".claude\skills\qa-test-generator\node_modules" call npm install --prefix .claude\skills\qa-test-generator
start "" http://localhost:4600
node web\server.js
