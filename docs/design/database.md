# データベース設計書

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| アプリケーション名 | TaskFlow |
| 対象データベース | SQLite 3 |
| DBファイル | `tasks.db`（プロジェクトルート、自動作成） |
| 作成日 | 2026-04-04 |
| 対象ソース | `taskflow/core/database.py`, `taskflow/core/models.py` |

---

## 2. データベース構成概要

### 接続設定

| 設定 | 値 | 説明 |
|------|----|------|
| `PRAGMA journal_mode` | `WAL` | Write-Ahead Logging。読み取りと書き込みを並行実行可能にし、クラッシュ耐性を向上 |
| `PRAGMA foreign_keys` | `ON` | 外部キー制約を有効化 |
| `row_factory` | `sqlite3.Row` | カラム名によるアクセスを可能にする |

### 接続ライフサイクル

- Flask の `g` オブジェクトにリクエスト単位でDB接続を保持する（`get_db()`）
- リクエスト終了時に `close_db()` で接続をクローズする
- `init_db()` はアプリ起動時に一度だけ呼ばれ、テーブル作成とマイグレーションを実行する

### コアテーブル一覧

| テーブル名 | 説明 |
|------------|------|
| `users` | チームメンバー（担当者）情報 |
| `tasks` | タスク情報（ガントチャート・TODO管理の主体） |

拡張テーブルは `ext_` プレフィクスを用いて各拡張が管理する（詳細は [第8章](#8-拡張テーブル規約) を参照）。

---

## 3. テーブル定義

### 3.1 users テーブル

チームメンバー（担当者）を管理する。

```sql
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER   PRIMARY KEY AUTOINCREMENT,
    name       TEXT      NOT NULL UNIQUE,
    color      TEXT      NOT NULL DEFAULT '#4A90D9',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### カラム定義

| カラム名 | 型 | 制約 | デフォルト値 | 説明 |
|----------|----|------|--------------|------|
| `id` | INTEGER | PK, AUTOINCREMENT | — | サロゲートキー |
| `name` | TEXT | NOT NULL, UNIQUE | — | ユーザー名（一意） |
| `color` | TEXT | NOT NULL | `#4A90D9` | ガントチャート表示色（16進カラーコード） |
| `created_at` | TIMESTAMP | — | `CURRENT_TIMESTAMP` | レコード作成日時 |

#### 初期データ

アプリ初回起動時（usersテーブルが空の場合）に以下の3件を投入する。

| name | color |
|------|-------|
| 田中 | `#4A90D9`（青） |
| 佐藤 | `#E8913A`（オレンジ） |
| 鈴木 | `#50B83C`（緑） |

#### インデックス

| インデックス | カラム | 種別 | 備考 |
|-------------|--------|------|------|
| `sqlite_autoindex_users_1` | `name` | UNIQUE | DDL の UNIQUE 制約により自動作成 |

---

### 3.2 tasks テーブル

タスク・ガントチャートの主体テーブル。自己参照外部キーによりサブタスク階層を表現する。

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER   PRIMARY KEY AUTOINCREMENT,
    title          TEXT      NOT NULL,
    description    TEXT      DEFAULT '',
    assignee_id    INTEGER,
    start_date     DATE      NOT NULL,
    estimated_hours REAL     NOT NULL DEFAULT 8,
    progress       INTEGER   DEFAULT 0
                             CHECK(progress >= 0 AND progress <= 100),
    priority       TEXT      DEFAULT 'medium'
                             CHECK(priority IN ('low', 'medium', 'high')),
    status         TEXT      DEFAULT 'todo'
                             CHECK(status IN ('todo', 'in_progress', 'done')),
    parent_id      INTEGER,
    sort_order     INTEGER   DEFAULT 0,
    milestone      DATE,
    category       TEXT      DEFAULT '',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignee_id) REFERENCES users(id),
    FOREIGN KEY (parent_id)   REFERENCES tasks(id) ON DELETE SET NULL
);
```

#### カラム定義

| カラム名 | 型 | 制約 | デフォルト値 | 説明 |
|----------|----|------|--------------|------|
| `id` | INTEGER | PK, AUTOINCREMENT | — | サロゲートキー |
| `title` | TEXT | NOT NULL | — | タスク名 |
| `description` | TEXT | — | `''` | 詳細説明 |
| `assignee_id` | INTEGER | FK → `users.id` | NULL | 担当者（NULL = 未割り当て） |
| `start_date` | DATE | NOT NULL | — | 開始日（`YYYY-MM-DD`形式） |
| `estimated_hours` | REAL | NOT NULL | `8` | 見積工数（時間）。1日 = 8時間換算 |
| `progress` | INTEGER | CHECK 0〜100 | `0` | 進捗率（%） |
| `priority` | TEXT | CHECK 列挙値 | `'medium'` | 優先度: `low` / `medium` / `high` |
| `status` | TEXT | CHECK 列挙値 | `'todo'` | ステータス: `todo` / `in_progress` / `done` |
| `parent_id` | INTEGER | FK → `tasks.id` ON DELETE SET NULL | NULL | 親タスクID（サブタスク階層） |
| `sort_order` | INTEGER | — | `0` | 表示順序 |
| `milestone` | DATE | — | NULL | マイルストーン日付（`YYYY-MM-DD`形式） |
| `category` | TEXT | — | `''` | カテゴリ名（自由テキスト） |
| `created_at` | TIMESTAMP | — | `CURRENT_TIMESTAMP` | レコード作成日時 |
| `updated_at` | TIMESTAMP | — | `CURRENT_TIMESTAMP` | レコード最終更新日時（更新時に手動セット） |

#### CHECK 制約まとめ

| カラム | 制約内容 |
|--------|----------|
| `progress` | `progress >= 0 AND progress <= 100` |
| `priority` | `priority IN ('low', 'medium', 'high')` |
| `status` | `status IN ('todo', 'in_progress', 'done')` |

#### 外部キー

| 参照元カラム | 参照先 | 削除時の動作 |
|-------------|--------|-------------|
| `assignee_id` | `users(id)` | デフォルト（RESTRICT相当）→ アプリ側で NULL セット後に削除 |
| `parent_id` | `tasks(id)` | `ON DELETE SET NULL`（親タスク削除時にサブタスクの parent_id を NULL化） |

> **注意**: `assignee_id` の FK には `ON DELETE` 句がない。ユーザー削除時はアプリ側（`routes.py`）で先に `assignee_id = NULL` に更新してから `DELETE FROM users` を実行する。

#### ステータスと進捗の対応規則

ガントチャートから進捗を変更すると、ステータスが自動で連動する（フロントエンド制御）。

| progress | status |
|----------|--------|
| 0% | `todo` |
| 1〜99% | `in_progress` |
| 100% | `done` |

---

## 4. ER図

```
users                           tasks
───────────────────────         ─────────────────────────────────────
id         INTEGER PK      ←── assignee_id  INTEGER FK (NULL可)
name       TEXT UNIQUE          id           INTEGER PK
color      TEXT                 title        TEXT NOT NULL
created_at TIMESTAMP            description  TEXT
                                start_date   DATE NOT NULL
                                estimated_hours REAL
                                progress     INTEGER (0-100)
                                priority     TEXT (low/medium/high)
                                status       TEXT (todo/in_progress/done)
                           ┐    parent_id    INTEGER FK → tasks.id  ──┐
                           │    sort_order   INTEGER                   │ 自己参照
                           │    milestone    DATE                      │
                           │    category     TEXT                      │
                           │    created_at   TIMESTAMP                 │
                           │    updated_at   TIMESTAMP              ───┘
                           │
                           └── (1) users : (N) tasks  [LEFT JOIN]

リレーションシップ:
  users (1) ──────── (N) tasks      担当者（assignee_id）
  tasks (1) ──────── (N) tasks      親子タスク（parent_id, 自己参照）
```

---

## 5. マイグレーション設計

`init_db()` の末尾で `PRAGMA table_info(tasks)` を使い、不足カラムを検出してマイグレーションを実行する。マイグレーションは冪等（何度実行しても安全）に設計されている。

### マイグレーション一覧

| ステップ | 条件 | 処理内容 |
|----------|------|----------|
| M-1 | `end_date` カラムが存在する | テーブル再作成で `end_date` を削除 |
| M-2 | `estimated_hours` カラムが存在しない | `ALTER TABLE ADD COLUMN` で追加し旧 `end_date` から逆算 |
| M-3 | `milestone` カラムが存在しない | `ALTER TABLE ADD COLUMN milestone DATE` |
| M-4 | `category` カラムが存在しない | `ALTER TABLE ADD COLUMN category TEXT DEFAULT ''` |

### M-1: end_date カラム削除（テーブル再作成）

SQLite は `DROP COLUMN` をサポートしないため、テーブルを作り直す方式をとる。

```sql
PRAGMA foreign_keys=OFF;

CREATE TABLE tasks_new (
    -- (end_date を除いた全カラム定義)
);

INSERT INTO tasks_new (id, title, description, assignee_id, start_date,
    estimated_hours, progress, priority, status, parent_id, sort_order,
    created_at, updated_at)
SELECT id, title, description, assignee_id, start_date,
    COALESCE(estimated_hours, 8),
    progress, priority, status, parent_id, sort_order, created_at, updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

PRAGMA foreign_keys=ON;
```

### M-2: estimated_hours 追加（旧データの逆算）

```sql
ALTER TABLE tasks ADD COLUMN estimated_hours REAL NOT NULL DEFAULT 8;

UPDATE tasks
SET estimated_hours = MAX(1, (julianday(end_date) - julianday(start_date) + 1) * 8);
```

旧 `end_date` から工数を逆算する（最低1時間を保証）。

### M-3: milestone 追加

```sql
ALTER TABLE tasks ADD COLUMN milestone DATE;
```

### M-4: category 追加

```sql
ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT '';
```

---

## 6. クエリパターン

### 6.1 定数定義（`taskflow/core/models.py`）

```python
TASK_SELECT = """
    SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
"""

TASK_FIELDS = [
    'title', 'description', 'assignee_id', 'start_date', 'estimated_hours',
    'progress', 'priority', 'status', 'parent_id', 'sort_order', 'milestone',
    'category',
]
```

### 6.2 タスク一覧取得

```sql
SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
FROM tasks t
LEFT JOIN users u ON t.assignee_id = u.id
ORDER BY t.sort_order, t.start_date, t.id
```

### 6.3 タスク作成

```sql
INSERT INTO tasks (title, description, assignee_id, start_date, estimated_hours,
    progress, priority, status, parent_id, sort_order, milestone, category)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### 6.4 タスク更新

`TASK_FIELDS` に含まれるキーのみを動的に更新する。`updated_at` は常にセットする。

```sql
UPDATE tasks
SET <field1> = ?, <field2> = ?, ..., updated_at = CURRENT_TIMESTAMP
WHERE id = ?
```

### 6.5 ユーザー削除（2ステップ）

外部キー制約のため、先に参照元を NULL にしてからユーザーを削除する。

```sql
-- Step 1: 担当タスクの assignee_id を NULL に
UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?;

-- Step 2: ユーザーを削除
DELETE FROM users WHERE id = ?;
```

### 6.6 タスク削除（2ステップ）

サブタスクを先に削除してから親タスクを削除する。

```sql
-- Step 1: サブタスクを削除
DELETE FROM tasks WHERE parent_id = ?;

-- Step 2: 親タスクを削除
DELETE FROM tasks WHERE id = ?;
```

> `parent_id` FK には `ON DELETE SET NULL` が定義されているが、アプリ側で明示的にサブタスクを削除している（孤立タスクを残さないため）。

### 6.7 カテゴリ一覧取得

```sql
SELECT DISTINCT category
FROM tasks
WHERE category != '' AND category IS NOT NULL
```

---

## 7. 計算フィールド（DBに保存しない）

以下のフィールドはDBに永続化せず、フロントエンド（`app.jsx`）で動的に計算する。

| フィールド名 | 計算元 | 説明 |
|-------------|--------|------|
| `end_date` | `start_date` + `estimated_hours` + `holidayMode` | 終了日。1日=8時間換算。`holidayMode` に応じて週末・日本の祝日をスキップ |
| `shifted_start_date` | `start_date` + 担当者の日程重複 | ガントチャートの自動シフト表示用。担当者の既存タスクと重複しないよう開始日をずらした値 |
| `assignee_name` | `users.name`（JOIN結果） | 担当者名。`TASK_SELECT` の LEFT JOIN で取得 |
| `assignee_color` | `users.color`（JOIN結果） | 担当者カラー。`TASK_SELECT` の LEFT JOIN で取得 |

### holidayMode

`localStorage` に保存され、全ての `end_date` 計算に適用される。

| 値 | 動作 |
|----|------|
| `weekends` | 土日をスキップして工数を換算 |
| `weekends_holidays` | 土日 + 日本の祝日をスキップして工数を換算 |

---

## 8. 拡張テーブル規約

TaskFlow の拡張システムは `extensions/` ディレクトリへのパッケージ配置で動作する。拡張がDBテーブルを作成する場合は以下の規約に従う。

| 規約 | 内容 |
|------|------|
| テーブル名プレフィクス | `ext_` 必須（例: `ext_labels`） |
| 冪等性 | `CREATE TABLE IF NOT EXISTS` を使用 |
| コアテーブル参照 | `ON DELETE CASCADE` を推奨（参照整合性の維持） |
| 作成タイミング | 拡張クラスの `init_db(self, db)` メソッド内で実行 |

### 拡張テーブル例

```sql
-- extensions/my_ext/__init__.py の init_db() 内
CREATE TABLE IF NOT EXISTS ext_my_data (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    value   TEXT    NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### 拡張バックエンドの基本構造

```python
from taskflow.extensions.base import TaskFlowExtension

class Extension(TaskFlowExtension):
    name    = 'my_ext'
    label   = 'サンプル'
    version = '1.0'

    def get_blueprint(self): ...     # Flask Blueprint または None
    def init_db(self, db): ...       # CREATE TABLE IF NOT EXISTS ext_*
    def get_static_files(self):
        return {'jsx': ['my.jsx'], 'css': []}
```

---

## 9. データ整合性・制約

### 9.1 制約一覧

| テーブル | 制約種別 | 対象カラム | 内容 |
|----------|----------|----------|------|
| users | PRIMARY KEY | `id` | 一意・自動採番 |
| users | UNIQUE | `name` | ユーザー名の重複不可 |
| users | NOT NULL | `name`, `color` | 必須項目 |
| tasks | PRIMARY KEY | `id` | 一意・自動採番 |
| tasks | NOT NULL | `title`, `start_date`, `estimated_hours` | 必須項目 |
| tasks | CHECK | `progress` | 0〜100の整数 |
| tasks | CHECK | `priority` | `low` / `medium` / `high` のいずれか |
| tasks | CHECK | `status` | `todo` / `in_progress` / `done` のいずれか |
| tasks | FOREIGN KEY | `assignee_id` | `users(id)` 参照 |
| tasks | FOREIGN KEY | `parent_id` | `tasks(id)` 参照、ON DELETE SET NULL |

### 9.2 アプリケーション側の整合性保証

DBの制約だけでは対応しない整合性はアプリケーション層で管理する。

| シナリオ | 対応方法 |
|----------|----------|
| ユーザー削除 | 先に `UPDATE tasks SET assignee_id = NULL` を実行してから `DELETE FROM users` |
| タスク削除 | 先に `DELETE FROM tasks WHERE parent_id = ?` でサブタスクを削除してから親を削除 |
| タスク更新フィールド | `TASK_FIELDS` に含まれるキーのみを受け付け、不正カラムへのアクセスを防止 |
| `updated_at` の更新 | `UPDATE` 実行時に常に `updated_at = CURRENT_TIMESTAMP` をセット（DBトリガーなし） |

### 9.3 トランザクション

- Flask `g` オブジェクト経由の接続は自動コミットしない
- 各ルートハンドラで `db.commit()` を明示的に呼び出す
- マイグレーション内の複数ステップ操作は `executescript()` でまとめて実行し、処理後に `db.commit()` を呼ぶ
- WALモードにより、読み取りトランザクションは書き込みトランザクションをブロックしない
