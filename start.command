#!/bin/bash
# TaskFlow - Mac 用ランチャー
# Finder でダブルクリックすると Terminal で実行されます。

# スクリプトのあるディレクトリに移動（ダブルクリック時は CWD がホームになるため必須）
cd "$(dirname "$0")" || exit 1

# Terminal ウィンドウのタイトルを設定
printf '\033]0;TaskFlow\007'

echo "=================================================="
echo "  TaskFlow - セットアップ & 起動"
echo "=================================================="
echo

# -----------------------------------------------
# エラー時に pause する関数
# -----------------------------------------------
pause_on_error() {
    echo
    echo "エラーが発生しました。このウィンドウを閉じてください。"
    read -r -p "Enter キーで終了します... " _
    exit 1
}

# -----------------------------------------------
# 1. Python チェック
# -----------------------------------------------
echo "[1/3] Python を確認中..."

# Mac では python3 が標準。python でも可。
if command -v python3 > /dev/null 2>&1; then
    PYTHON=python3
elif command -v python > /dev/null 2>&1; then
    PYTHON=python
else
    echo
    echo "[エラー] Python が見つかりません。"
    echo "  下記いずれかの方法でインストールしてください:"
    echo "   1) https://www.python.org/downloads/ からダウンロード"
    echo "   2) ターミナルで 'xcode-select --install' を実行"
    echo "   3) Homebrew で 'brew install python' を実行"
    pause_on_error
fi
echo "  $($PYTHON --version) を検出しました"
echo

# -----------------------------------------------
# 2. 仮想環境チェック / 作成
# -----------------------------------------------
echo "[2/3] 仮想環境を確認中..."
if [ -f "venv/bin/activate" ]; then
    echo "  既存の仮想環境を使用します"
else
    echo "  仮想環境が見つかりません。作成します..."
    "$PYTHON" -m venv venv
    if [ $? -ne 0 ]; then
        echo "[エラー] 仮想環境の作成に失敗しました。"
        pause_on_error
    fi
    echo "  仮想環境を作成しました"
fi

# shellcheck disable=SC1091
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "[エラー] 仮想環境の有効化に失敗しました。"
    pause_on_error
fi
echo

# -----------------------------------------------
# 3. 依存パッケージチェック / インストール
# -----------------------------------------------
echo "[3/3] 依存パッケージを確認中..."
if pip show flask > /dev/null 2>&1; then
    echo "  インストール済みです"
else
    echo "  パッケージが見つかりません。インストールします..."
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "[エラー] パッケージのインストールに失敗しました。"
        pause_on_error
    fi
    echo "  インストール完了"
fi
echo

# -----------------------------------------------
# 起動
# -----------------------------------------------
echo "--------------------------------------------------"
echo "  準備完了！起動後、自動でブラウザが開きます"
echo "  アドレス: http://localhost:5050"
echo "  （終了するには Ctrl+C を押してください）"
echo "--------------------------------------------------"
echo

# サーバー起動直後にブラウザを自動で開く（3秒待機）
(
    sleep 3
    open "http://localhost:5050" 2>/dev/null
) &

python app.py

echo
read -r -p "アプリを終了しました。Enter キーで閉じます... " _
