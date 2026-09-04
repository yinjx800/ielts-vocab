@echo off
chcp 65001 >nul
title 雅思词汇系统 · 代码推送到 GitHub
cd /d "%~dp0"

echo ========================================================
echo   正在将项目代码推送到 GitHub:
echo   https://github.com/yinjx800/ielts-vocab.git
echo ========================================================
echo.
echo 如果系统弹出浏览器授权登录窗口，请点击【Sign in with your browser / Authorize】完成授权。
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/yinjx800/ielts-vocab.git
git branch -M main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   [成功] 代码已全部推送到你的 GitHub 仓库！
    echo ========================================================
    echo.
    echo 下一步：前往你的 GitHub 仓库开启 GitHub Pages，即可拥有终身免费网址：
    echo https://yinjx800.github.io/ielts-vocab/
) else (
    echo.
    echo [提示] 推送遇到问题，请检查网络或 GitHub 登录授权。
)

echo.
pause
