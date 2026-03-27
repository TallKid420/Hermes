@echo off
:: ============================================================
:: Hermes PC Listener — Auto-start installer
:: Registers pc_listener.py as a Task Scheduler task so it
:: starts automatically when you log in.
:: Also sets the lid-close action to "Do nothing" so the
:: listener keeps running when the laptop lid is closed.
::
:: Run once as Administrator:
::   Right-click install_autostart.bat -> Run as administrator
:: ============================================================

setlocal

:: --- paths ---
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
set "VENV_PYTHON=%PROJECT_DIR%\.venv-1\Scripts\python.exe"
set "LISTENER=%SCRIPT_DIR%pc_listener.py"
set "TASK_NAME=HermesPCListener"

:: Resolve absolute paths
pushd "%PROJECT_DIR%"
set "PROJECT_DIR=%CD%"
popd

pushd "%SCRIPT_DIR%"
set "SCRIPT_DIR=%CD%"
popd

set "VENV_PYTHON=%PROJECT_DIR%\.venv-1\Scripts\python.exe"
set "LISTENER=%SCRIPT_DIR%\pc_listener.py"

echo.
echo [1/3] Setting lid-close power action to "Do nothing" (keeps PC awake when lid closes)...
:: AC power (plugged in)
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
:: Battery / DC power
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /S SCHEME_CURRENT
echo     Done.

echo.
echo [2/3] Removing any existing "%TASK_NAME%" scheduled task...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

echo.
echo [3/3] Creating scheduled task to start pc_listener.py at login...
schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "\"%VENV_PYTHON%\" \"%LISTENER%\"" ^
  /SC ONLOGON ^
  /DELAY 0000:10 ^
  /RL HIGHEST ^
  /F

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo  SUCCESS
    echo  Task "%TASK_NAME%" created.
    echo  pc_listener.py will auto-start every time you log in.
    echo  Lid-close action set to "Do nothing" on AC + battery.
    echo.
    echo  To start it now without rebooting:
    echo    schtasks /Run /TN "%TASK_NAME%"
    echo.
    echo  To remove the task later:
    echo    schtasks /Delete /TN "%TASK_NAME%" /F
    echo ============================================================
) else (
    echo.
    echo  ERROR: Failed to create scheduled task.
    echo  Make sure you ran this as Administrator.
)

pause
