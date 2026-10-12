@echo off
rem Builds dist\LumenCinema.exe (needs: pip install pyinstaller). The GitHub release workflow runs this too.
cd /d "%~dp0"
pyinstaller --noconfirm --onefile --name LumenCinema ^
  --add-data "static;static" --add-data "catalog.json;." --add-data "data/uploads;data/uploads" ^
  server.py
