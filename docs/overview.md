# TaskFlow 全体設計ドキュメント

## このドキュメントについて

TaskFlow の全体像を把握するためのドキュメントです。
コードを修正する前に、まずこのドキュメントを読んでシステムの構造を理解してください。

---

## 1. アプリの概要

TaskFlow は **Webブラウザで動くタスク管理アプリ** です。
Flask（Pythonのサーバー）が動き、ブラウザからアクセスして使います。

```
あなたのPC上でサーバーが動く
  → ブラウザで http://localhost:5000 にアクセス
  → タスクを登録・編集・確認できる
```

データは PC 上の `tasks.db` ファイル（SQLite）に保存されます。
クラウドやインターネット接続は不要です。

---

## 2. ディレクトリ構成と役割

```
taskflow/                      ← プロジェクトルート
│
├── app.py                     ← 【起動スクリプト】python app.py で起動
├── requirements.txt           ← 必要なPythonパッケージの一覧
├── start.bat                  ← ダブルクリックで起動（Windows用）
├── tasks.db                   ← データベース（初回起動時に自動生成）
│
├── taskflow/                  ← 【メインのPythonパッケージ】
│   ├── __init__.py            ← アプリの初期化（ここから全てが始まる）
│   ├── __main__.py            ← python -m taskflow で起動する場合のエントリポイント
│   │
│   ├── core/                  ← コア機能（変更頻度が低い基盤部分）
│   │   ├── database.py        ← データベース接続・テーブル作成
│   │   ├── models.py          ← SQLクエリの定数定義
│   │   └── routes.py          ← API エンドポイントの定義
│   │
│   ├── extensions/            ← 拡張機能ローダー（拡張の仕組み自体）
│   │   ├── base.py            ← 拡張機能の基底クラス
│   │   └── __init__.py        ← 拡張の自動検出・登録ロジック
│   │
│   ├── static/                ← フロントエンドのファイル
│   │   ├── app.jsx            ← 全Reactコンポーネント
│   │   └── style.css          ← 全スタイル
│   │
│   └── templates/
│       └── index.html         ← HTMLの骨格（JSX/CSSを読み込む）
│
├── extensions/                ← 【ユーザーが拡張を置く場所】
│   └── README.md              ← 拡張の作り方ガイド
│
└── docs/                      ← 設計ドキュメント（このフォルダ）
    ├── overview.md            ← 全体構成（このファイル）
    ├── backend.md             ← バックエンド詳細
    ├── frontend.md            ← フロントエンド詳細
    ├── database.md            ← データベース設計
    └── extensions.md          ← 拡張機能の作り方（詳細版）
```

---

## 3. システムの全体像

### リクエストの流れ

```
ブラウザ
  │
  │  HTTP リクエスト
  ▼
Flask サーバー (app.py → taskflow/__init__.py)
  │
  ├── GET /          → index.html を返す（HTMLの骨格）
  │                      ↓ ブラウザがJSXを読み込む
  │                      ↓ Reactアプリが起動
  │
  ├── GET /api/tasks → タスク一覧をJSONで返す
  ├── POST /api/tasks → タスクを作成
  ├── PUT /api/tasks/1 → タスクを更新
  ├── DELETE /api/tasks/1 → タスクを削除
  │
  ├── GET /api/users  → ユーザー一覧をJSONで返す
  └── GET /api/extensions → 拡張機能一覧をJSONで返す
```

### バックエンドとフロントエンドの関係

```
【バックエンド (Python/Flask)】        【フロントエンド (React/JSX)】
  taskflow/core/routes.py               taskflow/static/app.jsx
        │                                       │
        │  JSON でやり取り                       │
        └───────────────────────────────────────┘
        │                                       │
        ▼                                       ▼
  tasks.db (SQLite)              ブラウザのメモリ上にデータを保持
```

- **バックエンド** はデータの保存・取得を担当
- **フロントエンド** は画面の表示・ユーザー操作を担当
- 両者は **JSON** という形式でデータをやり取りします

---

## 4. 主要な技術

| 技術 | 用途 | なぜ採用したか |
|------|------|---------------|
| Python 3.9+ | サーバー言語 | シンプルで読みやすい |
| Flask | Webフレームワーク | 軽量で学習コストが低い |
| SQLite | データベース | ファイル1つで動く、サーバー不要 |
| React 18 | UIフレームワーク | コンポーネント単位で管理しやすい |
| Babel standalone | JSX変換 | ビルド不要、CDNから読み込むだけ |
| Jinja2 | HTMLテンプレート | Flaskに標準搭載 |

> **ビルドが不要**なのが特徴です。
> ReactはCDN（インターネット上）から読み込み、BabelがブラウザでJSXを変換します。
> `npm install` や `webpack` などは一切不要です。

---

## 5. 起動の仕組み（コードの流れ）

```
python app.py
    │
    ▼
taskflow/__init__.py の create_app() が呼ばれる
    │
    ├── 1. Flask アプリを作成
    ├── 2. tasks.db のパスを設定
    ├── 3. init_db() → usersテーブル・tasksテーブルを作成
    ├── 4. register_routes() → APIルートを登録
    ├── 5. discover_extensions() → extensions/ フォルダを走査
    ├── 6. register_extensions() → 各拡張のDB・Blueprint・静的ファイルを登録
    └── 7. /api/extensions エンドポイントを登録
    │
    ▼
app.run(host='0.0.0.0', port=5000) でサーバー開始
```

---

## 6. 拡張機能の仕組み（概要）

TaskFlow は **プラグイン形式の拡張システム** を持っています。
`extensions/` フォルダにフォルダを置くだけで機能を追加できます。

```
extensions/
  my_feature/          ← このフォルダを作るだけ
    __init__.py         ← バックエンド（APIルート、DBテーブル）
    static/
      my_feature.jsx    ← フロントエンド（UI）
      my_feature.css    ← スタイル
```

詳細は [extensions.md](extensions.md) を参照してください。

---

## 7. 各ドキュメントの案内

| ドキュメント | 内容 | こんな時に読む |
|-------------|------|--------------|
| [backend.md](backend.md) | Flask, API, DB接続 | APIを追加・変更したい |
| [frontend.md](frontend.md) | React コンポーネント, 状態管理 | 画面を変更したい |
| [database.md](database.md) | テーブル設計, マイグレーション | DBのカラムを追加したい |
| [extensions.md](extensions.md) | 拡張機能の作り方 | 新しい機能を追加したい |
