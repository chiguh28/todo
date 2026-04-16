# TaskFlow バックエンド設計書

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| アプリ名 | TaskFlow |
| バージョン | 現行実装準拠 |
| 対象 | バックエンド（Python/Flask/SQLite） |
| 作成日 | 2026-04-04 |
| 言語 | Python 3 |

---

## 2. システム構成図

```
[ブラウザ]
    |
    | HTTP (port 5050)
    v
[Flask アプリ]
    |
    +-- GET /                  → index.html（SPA シェル）
    |
    +-- /api/users             → Users API
    +-- /api/tasks             → Tasks API
    +-- /api/categories        → Categories API
    +-- /api/extensions        → Extensions API
    +-- /extensions/<name>/static/<file>  → 拡張静的ファイル配信
    |
    +-- [拡張 Blueprint]       → 拡張固有 API（任意）
    |
    v
[SQLite: tasks.db]
    |
    +-- users テーブル
    +-- tasks テーブル
    +-- ext_* テーブル（拡張機能が追加）
```

---

## 3. モジュール構成と責務

```
app.py                    # ランチャー（create_app() → app.run()）
taskflow/
  __init__.py             # create_app() ファクトリ
  __main__.py             # python -m taskflow エントリポイント
  core/
    database.py           # DB接続・初期化・マイグレーション
    models.py             # SQL定数（TASK_SELECT, TASK_FIELDS）
    routes.py             # コアAPIルート登録（register_routes）
  extensions/
    __init__.py           # 拡張発見・登録（discover_extensions, register_extensions）
    base.py               # TaskFlowExtension 基底クラス
  static/                 # フロントエンド静的ファイル（app.jsx, style.css）
  templates/
    index.html            # Jinja2テンプレート（SPAシェル）
extensions/               # ユーザー拡張パッケージ（.gitignore対象）
tasks.db                  # SQLite データベース（自動生成、.gitignore対象）
```

### 各モジュールの責務

| モジュール | 責務 |
|-----------|------|
| `app.py` | `create_app()` を呼び出し `app.run(debug=True, host='0.0.0.0', port=5050)` で起動するだけの薄いランチャー。ロジックを追加しない。 |
| `taskflow/__init__.py` | Flaskアプリの生成・設定・初期化を一手に担うファクトリ。DB初期化 → コアルート登録 → 拡張ロード → 拡張API定義の順で実行。 |
| `taskflow/__main__.py` | `python -m taskflow` 実行時のエントリポイント。`create_app()` を呼んで起動する。 |
| `core/database.py` | DB接続のライフサイクル管理（取得・クローズ）、テーブル定義、マイグレーション、初期データ投入。 |
| `core/models.py` | SQL文の定数を保持。エンドポイント間で共有されるクエリ断片をここで一元管理。 |
| `core/routes.py` | コアAPIルートをすべて `register_routes(app)` 関数内にクロージャとして定義し、アプリに登録する。 |
| `extensions/__init__.py` | `extensions/` ディレクトリの走査、拡張インスタンスの発見・検証、Flaskへの登録（DB初期化・Blueprint・静的配信）。 |
| `extensions/base.py` | 拡張機能が継承すべき基底クラス。インターフェースの型安全性を担保。 |

---

## 4. DB接続・ライフサイクル管理

### 接続取得（`get_db`）

```
リクエスト開始
    |
    v
get_db() 呼び出し
    |
    +-- g に 'db' がない場合
    |       sqlite3.connect(DB_PATH)
    |       row_factory = sqlite3.Row
    |       PRAGMA journal_mode=WAL
    |       PRAGMA foreign_keys=ON
    |
    v
g.db を返す（リクエスト中は同一接続を再利用）
    |
    v
teardown_appcontext → close_db() → db.close()
```

### 設定値

| 設定 | 値 | 目的 |
|------|----|------|
| `journal_mode=WAL` | WAL（Write-Ahead Logging） | 読み書き並行性向上 |
| `foreign_keys=ON` | 外部キー制約を有効化 | 参照整合性の保証 |
| `row_factory=sqlite3.Row` | 列名アクセス可能な行オブジェクト | `dict(row)` で辞書変換 |

### DB パス設定

`create_app()` の `instance_path` 引数で決定する。省略時は `app.py` と同階層（プロジェクトルート）。

```python
app.config['DB_PATH'] = os.path.join(instance_path, 'tasks.db')
```

---

## 5. ルーティング設計

### コアルート（`register_routes` で登録）

| Method | Path | 機能 | 主なバリデーション |
|--------|------|------|-------------------|
| GET | `/` | `index.html` 配信（拡張一覧をテンプレートに渡す） | - |
| GET | `/api/users` | ユーザー一覧（`id` 昇順） | - |
| POST | `/api/users` | ユーザー作成 | `name` 必須。重複時 400 |
| DELETE | `/api/users/:id` | ユーザー削除。`tasks.assignee_id` を NULL に更新してから削除 | - |
| GET | `/api/tasks` | タスク一覧（`sort_order`, `start_date`, `id` 昇順） | - |
| POST | `/api/tasks` | タスク作成（12フィールド）。作成後に JOIN した行を返す | `title`, `start_date` 必須 |
| PUT | `/api/tasks/:id` | タスク更新（`TASK_FIELDS` に含まれるキーのみ動的更新。`updated_at` 自動付与） | - |
| DELETE | `/api/tasks/:id` | タスク削除（子タスクを先に削除してから親を削除） | - |
| GET | `/api/categories` | カテゴリ一覧（`tasks.category` の DISTINCT 値、空文字除外、昇順） | - |

### 拡張機能ルート（`create_app` 内で登録）

| Method | Path | 機能 |
|--------|------|------|
| GET | `/api/extensions` | ロード済み拡張の名前・ラベル・バージョン・静的ファイルURLを返す |
| * | `/extensions/<name>/static/<file>` | 各拡張の `static/` ディレクトリを Blueprint 経由で配信 |
| * | 拡張固有パス | 各拡張の `get_blueprint()` が返す Blueprint で定義（任意） |

### レスポンス形式

- 成功時: JSON (`Content-Type: application/json`)
- 作成成功: HTTP 201
- エラー時: `{"error": "メッセージ"}` + 適切なステータスコード
- 削除・更新成功: `{"status": "ok"}` または更新後のタスクオブジェクト

---

## 6. データモデル定数（`models.py`）

### `TASK_SELECT`

タスク一覧・単件取得で共通使用するベースクエリ。`users` テーブルと LEFT JOIN し、担当者名・担当者カラーを付加する。

```sql
SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
FROM tasks t
LEFT JOIN users u ON t.assignee_id = u.id
```

### `TASK_FIELDS`

PUT `/api/tasks/:id` での動的 UPDATE に使用する更新可能フィールド一覧。リクエスト JSON に含まれるキーのみを SET 句に追加するため、不要フィールドの上書きを防ぐ。

```python
TASK_FIELDS = [
    'title', 'description', 'assignee_id', 'start_date', 'estimated_hours',
    'progress', 'priority', 'status', 'parent_id', 'sort_order', 'milestone',
    'category',
]
```

**規約**: `tasks` テーブルのスキーマを変更する際は、必ず `TASK_SELECT` と `TASK_FIELDS` も合わせて更新すること。

---

## 7. テーブル定義

### `users` テーブル

| 列名 | 型 | 制約 | 説明 |
|------|----|------|------|
| `id` | INTEGER | PK, AUTOINCREMENT | ユーザーID |
| `name` | TEXT | NOT NULL, UNIQUE | ユーザー名 |
| `color` | TEXT | NOT NULL, DEFAULT `#4A90D9` | 表示カラー（HEX） |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

### `tasks` テーブル

| 列名 | 型 | 制約 | 説明 |
|------|----|------|------|
| `id` | INTEGER | PK, AUTOINCREMENT | タスクID |
| `title` | TEXT | NOT NULL | タイトル |
| `description` | TEXT | DEFAULT `''` | 説明 |
| `assignee_id` | INTEGER | FK → users(id) | 担当者 |
| `start_date` | DATE | NOT NULL | 開始日 |
| `estimated_hours` | REAL | NOT NULL, DEFAULT 8 | 見積時間（作業時間。1日=8h） |
| `progress` | INTEGER | DEFAULT 0, CHECK 0-100 | 進捗（%） |
| `priority` | TEXT | DEFAULT `medium` | 優先度（low/medium/high） |
| `status` | TEXT | DEFAULT `todo` | ステータス（todo/in_progress/done） |
| `parent_id` | INTEGER | FK → tasks(id) ON DELETE SET NULL | 親タスクID（サブタスク用） |
| `sort_order` | INTEGER | DEFAULT 0 | 表示順序 |
| `milestone` | DATE | - | マイルストーン日付 |
| `category` | TEXT | DEFAULT `''` | カテゴリ名 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新日時（PUT時に自動更新） |

**備考**: `end_date` はDBに保存しない。フロントエンドが `start_date` + `estimated_hours` + 休日モードから動的に計算する。

---

## 8. 拡張機能ローディング

### 起動時の処理フロー

```
create_app()
    |
    v
discover_extensions(extensions_dir)
    |
    extensions/ 以下のサブディレクトリを sorted() で走査
    |
    各ディレクトリで __init__.py の存在確認
    |
    importlib.import_module('extensions.<entry>') でモジュールロード
    |
    +-- extension インスタンス属性を探す
    +-- なければ Extension クラスを探して ext_instance = Extension() を生成
    |
    TaskFlowExtension サブクラスか検証 + name 属性の存在確認
    |
    v
register_extensions(app, extensions, get_db)
    |
    各拡張に対して:
    +-- 1. ext.init_db(db)           → ext_* テーブル作成
    +-- 2. ext.get_blueprint()       → Flask Blueprint 登録（None の場合はスキップ）
    +-- 3. static/ ディレクトリ存在確認 → Blueprint で /extensions/<name>/static/ として配信
    |
    v
app.config['TASKFLOW_EXTENSIONS'] = extensions  （一覧を保持）
```

### `TaskFlowExtension` 基底クラス

| 属性/メソッド | 型 | 説明 |
|--------------|-----|------|
| `name` | `str` | 一意なID（URLや内部識別に使用） |
| `label` | `str` | 日本語表示名 |
| `version` | `str` | バージョン文字列（デフォルト `"1.0"`） |
| `get_blueprint()` | `Blueprint \| None` | APIルートを持つ Blueprint を返す。不要な場合は `None` |
| `init_db(db)` | `None` | 拡張固有テーブルを作成。`sqlite3.Connection` を受け取る |
| `get_static_files()` | `dict` | `{'jsx': [...], 'css': [...]}` 形式でフロントエンドに読み込むファイルを返す |

### 拡張機能の発見規約

- `extensions/<name>/__init__.py` が存在すること
- モジュール内に `extension = Extension()` インスタンス、または `class Extension(TaskFlowExtension)` クラスを定義すること
- `name` 属性が空でないこと

---

## 9. マイグレーション戦略

マイグレーションはアプリ起動時の `init_db()` 内でインラインに実行する。外部ツール不使用。

### マイグレーション手順の実装パターン

```python
cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
if '旧列名' in cols:
    # テーブル再作成によるカラム削除
    db.executescript("""
        PRAGMA foreign_keys=OFF;
        CREATE TABLE tasks_new (...);
        INSERT INTO tasks_new SELECT ... FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
        PRAGMA foreign_keys=ON;
    """)
if '新列名' not in cols:
    db.execute("ALTER TABLE tasks ADD COLUMN 新列名 TYPE DEFAULT 値")
    db.commit()
```

### 実装済みマイグレーション一覧

| 条件 | 処理 |
|------|------|
| `end_date` 列が存在する | テーブル再作成で `end_date` を削除。`estimated_hours` を `COALESCE(estimated_hours, 8)` で移行 |
| `estimated_hours` 列が存在しない | `ALTER TABLE` で追加。旧 `end_date` から `(julianday(end_date) - julianday(start_date) + 1) * 8` で計算 |
| `milestone` 列が存在しない | `ALTER TABLE tasks ADD COLUMN milestone DATE` |
| `category` 列が存在しない | `ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT ''` |

### 設計方針

- **冪等性**: `CREATE TABLE IF NOT EXISTS` と列存在チェックにより、何度起動しても安全に実行できる
- **後方互換**: カラム追加は `DEFAULT` 値付きの `ALTER TABLE` で既存行への影響を最小化
- **外部キー制約の一時無効化**: テーブル再作成時は `PRAGMA foreign_keys=OFF` → 再作成 → `PRAGMA foreign_keys=ON` の手順を守る

---

## 10. エラーハンドリング方針

### コアルート

| 状況 | 処理 |
|------|------|
| ユーザー名重複（POST `/api/users`） | `sqlite3.IntegrityError` をキャッチし `{"error": "ユーザー名が重複しています"}` + HTTP 400 を返す |
| 存在しないリソースへの PUT/DELETE | SQLite はエラーを返さない（0件更新）。現状は特別なエラー応答なし |
| リクエスト JSON 欠損フィールド | Python の `KeyError` が未ハンドルのためサーバーエラーになる可能性あり（`title`, `start_date` が必須） |

### 拡張機能ローディング

| 状況 | 処理 |
|------|------|
| モジュールインポート失敗 | `print("[WARN] ...")` でログ出力し、その拡張をスキップして起動継続 |
| `TaskFlowExtension` 未継承 | `print("[WARN] ...")` でログ出力してスキップ |
| `init_db()` 失敗 | `try/except` でキャッチし `print("[WARN] ...")` でログ出力してスキップ |
| `get_blueprint()` 登録失敗 | `try/except` でキャッチし `print("[WARN] ...")` でログ出力してスキップ |

**方針**: 拡張機能のエラーはアプリ全体の起動を妨げない。コアルートのエラーは現状 Flask のデフォルトエラーレスポンスに委ねている。

---

## 付録. 起動シーケンス

```
python app.py
  └── create_app()
        ├── Flask インスタンス生成（static_folder, template_folder 設定）
        ├── app.config['DB_PATH'] 設定
        ├── teardown_appcontext に close_db 登録
        ├── [app_context] init_db()
        │     ├── CREATE TABLE IF NOT EXISTS users
        │     ├── CREATE TABLE IF NOT EXISTS tasks
        │     ├── マイグレーション実行（必要な場合のみ）
        │     └── デフォルトユーザー投入（usersが空の場合: 田中・佐藤・鈴木）
        ├── register_routes(app)  ← コアAPIルート登録
        ├── discover_extensions(extensions_dir)
        ├── [app_context] register_extensions(app, extensions, get_db)
        │     └── 各拡張: init_db → Blueprint登録 → 静的配信Blueprint登録
        ├── /api/extensions ルート定義
        └── return app
  └── app.run(debug=True, host='0.0.0.0', port=5050)
```
