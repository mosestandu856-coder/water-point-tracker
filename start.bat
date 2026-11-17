@echo off
title Community Water Point Tracker
echo ===================================================
echo Starting Community Water Point Tracker Servers...
echo ===================================================

echo [1/2] Starting Backend API (Port 5000)...
start "WaterTracker - Backend API (Port 5000)" cmd /k "node backend/server.js"

echo [2/2] Starting Frontend Dev Server (Port 3000)...
start "WaterTracker - Frontend Web (Port 3000)" cmd /k "npm --prefix frontend run dev"

echo.
echo Both servers are starting in separate windows!
echo Web App will be ready at: http://localhost:3000
echo Backend API healthcheck:  http://localhost:5000/api/health
echo ===================================================

