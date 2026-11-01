@echo off
rem Chanh Dien Online: bam dup de mo server (chu de dung lan cuoi), bang dieu khien va man hinh 9:16.
rem Doi chu de ngay trong bang dieu khien, khong can sua file nay.
cd /d "%~dp0live"
if not exist node_modules (
  echo Dang cai thu vien lan dau...
  call npm install
)
start "Chanh Dien Online server" cmd /k npm start
timeout /t 3 /nobreak >nul
start "" http://localhost:3000/live/control.html
start "" msedge --new-window --app=http://localhost:3000/live/man-hinh --window-size=540,960 --user-data-dir="%TEMP%\chanhdien-overlay" --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion
