@echo off
chcp 65001 >nul
title 雅思词汇真经 · 智能背单词平台
cd /d "%~dp0"

echo ========================================================
echo   《雅思词汇真经》智能五维记忆系统 启动器
echo ========================================================
echo.

:: 检查 Python 环境
set "PY_CMD="
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
) else (
    py --version >nul 2>&1
    if %errorlevel% equ 0 (
        set "PY_CMD=py"
    )
)

if "%PY_CMD%"=="" (
    echo [错误] 系统未检测到可用的 Python 环境！
    echo 请安装 Python 3.9 及以上版本，并确保勾选了 Add Python to PATH。
    echo.
    pause
    exit /b 1
)

:: 检查并自动补齐依赖
%PY_CMD% -c "import fastapi, uvicorn" >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 正在安装运行所需依赖 fastapi 和 uvicorn...
    %PY_CMD% -m pip install fastapi uvicorn
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接后重试。
        echo.
        pause
        exit /b 1
    )
)

:: 启动本地服务与浏览器 (run.py 内部会自动完成端口检测、释放与浏览器唤起)
%PY_CMD% run.py

if %errorlevel% neq 0 (
    echo.
    echo [提示] 服务已停止。
    pause
)

