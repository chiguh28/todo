# TaskFlow - Todo管理 + ガントチャート アプリ

タスクを登録するだけで自動的にガントチャートが生成される、ローカル運用のタスク管理アプリです。

## 機能

- **タスク一覧画面**: タスクのCRUD（作成・参照・更新・削除）、フィルタ・検索
- **ガントチャート画面**: 登録タスクの自動ガントチャート表示、今日の日付線、バークリックで進捗率を直接入力、開始日順ソート
- **工数ベースのスケジュール**: 工数（時間）を入力すると、休日を除いた終了日を自動計算（1日=8時間）
- **休日モード選択**: 土日のみ除外 / 土日＋祝日除外を切り替え可能
- **メンバー管理**: チームメンバーの登録、担当者色分け
- **フィルタリング**: 担当者・ステータス・キーワードでフィルタ
- **拡張機能システム**: `extensions/` フォルダに拡張を置くだけで機能追加可能

## 技術スタック

- **バックエンド**: Python (Flask) — パッケージ構造 (`taskflow/`)
- **DB**: SQLite（ローカルファイル `tasks.db`）
- **フロントエンド**: React 18 (CDN) + Babel standalone（ビルド不要）

## セットアップ（初回）

### 前提条件

- Python 3.9 以上がインストールされていること
- `python --version` で確認できます

### 簡単起動（推奨）

`start.bat` をダブルクリックするだけで、環境構築から起動まで自動で行います。

- Python がインストールされているか確認
- 仮想環境（venv）がなければ自動作成
- 依存パッケージがなければ自動インストール
- アプリを起動してブラウザで http://localhost:5000 にアクセス

### 手動セットアップ（コマンドで実行する場合）

**1. zipを解凍する**

受け取った `taskflow.zip` を任意のフォルダに解凍します。

```
taskflow/          ← このフォルダに展開される
  app.py
  requirements.txt
  taskflow/
  extensions/
  ...
```

**2. ターミナルでフォルダに移動する**

```bash
cd taskflow        # 解凍したフォルダ名に合わせてください
```

**3. 仮想環境を作成する**（初回のみ）

```bash
python -m venv venv
```

**4. 仮想環境を有効化する**

```bash
# Windows コマンドプロンプト
venv\Scripts\activate.bat

# Windows PowerShell
venv\Scripts\Activate.ps1

# Windows Git Bash / Mac / Linux
source venv/Scripts/activate
```

有効化すると、プロンプトの先頭に `(venv)` が表示されます。

**5. 依存パッケージをインストールする**（初回のみ）

```bash
pip install -r requirements.txt
```

**6. アプリを起動する**

```bash
python app.py
```

以下のように表示されたら起動成功です。

```
==================================================
  TaskFlow - Todo管理 + ガントチャート
  http://localhost:5000
==================================================
```

ブラウザで http://localhost:5000 にアクセスしてください。

### 2回目以降の起動

```bash
cd taskflow                      # フォルダに移動
venv\Scripts\activate.bat        # 仮想環境を有効化（Windows）
python app.py                    # 起動
```

### アプリの停止

ターミナルで `Ctrl + C` を押すと停止します。

## ディレクトリ構成

```
taskflow/                  # Pythonパッケージ
├── __init__.py            # create_app() ファクトリ
├── core/
│   ├── database.py        # DB接続・初期化・マイグレーション
│   ├── models.py          # SQLクエリ定数
│   └── routes.py          # コアAPIルート
├── extensions/
│   ├── base.py            # TaskFlowExtension 基底クラス
│   └── __init__.py        # 拡張の自動検出・登録
├── static/
│   ├── app.jsx            # Reactコンポーネント
│   └── style.css          # スタイルシート
└── templates/
    └── index.html         # HTMLシェル
extensions/                # ユーザー拡張フォルダ
├── README.md              # 拡張の作り方
└── (拡張フォルダを追加)
app.py                     # 起動スクリプト（5行）
tasks.db                   # SQLiteDB（初回起動時に自動生成）
```

## 使い方

1. 「+新規タスク」からタスクを登録
   - タイトル・担当者・開始日・工数（時間）を入力
   - 工数から終了日が自動計算される
2. タスク一覧で確認・編集・削除
3. 「ガントチャート」タブで自動生成されたチャートを確認
4. ガントチャートのバーをクリックして進捗率を直接変更
5. フィルターバーの「休日モード」で土日/土日祝を切り替え

## 拡張機能の追加

`extensions/` フォルダに新しいサブフォルダを作成し、`__init__.py` に `Extension` クラスを実装するだけで機能を追加できます。詳細は [extensions/README.md](extensions/README.md) を参照してください。

```
extensions/
  my_extension/
    __init__.py     # Extension クラス（バックエンド）
    static/
      my_extension.jsx  # UIコンポーネント（フロントエンド）
```

## データ

- データベースファイル: `tasks.db`（アプリと同じディレクトリに自動生成）
- SQLite使用のためバックアップは `tasks.db` をコピーするだけ
