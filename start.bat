@echo off
chcp 65001 > nul
echo ==================================================
echo   TaskFlow - セットアップ ^& 起動
echo ==================================================
echo.

:: -----------------------------------------------
:: 1. Python チェック
:: -----------------------------------------------
echo [1/3] Python を確認中...
python --version > nul 2>&1
if errorlevel 1 (
    echo.
    echo [エラー] Python が見つかりません。
    echo   https://www.python.org/downloads/ からインストールしてください。
    echo   インストール時に "Add Python to PATH" にチェックを入れること。
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo   %%v を検出しました
echo.

:: -----------------------------------------------
:: 2. 仮想環境チェック / 作成
:: -----------------------------------------------
echo [2/3] 仮想環境を確認中...
if exist venv\Scripts\activate.bat (
    echo   既存の仮想環境を使用します
) else (
    echo   仮想環境が見つかりません。作成します...
    python -m venv venv
    if errorlevel 1 (
        echo [エラー] 仮想環境の作成に失敗しました。
        pause
        exit /b 1
    )
    echo   仮想環境を作成しました
)
call venv\Scripts\activate.bat
echo.

:: -----------------------------------------------
:: 3. 依存パッケージチェック / インストール
:: -----------------------------------------------
echo [3/3] 依存パッケージを確認中...
pip show flask > nul 2>&1
if errorlevel 1 (
    echo   パッケージが見つかりません。インストールします...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [エラー] パッケージのインストールに失敗しました。
        pause
        exit /b 1
    )
    echo   インストール完了
) else (
    echo   インストール済みです
)
echo.

:: -----------------------------------------------
:: 起動
:: -----------------------------------------------
echo --------------------------------------------------
echo   準備完了！ブラウザで以下にアクセスしてください
echo   http://localhost:5050
echo   （終了するには Ctrl+C を押してください）
echo --------------------------------------------------
echo.
python app.py
pause
