# データベース設計ドキュメント

## 対象ファイル

```
taskflow/core/database.py  ← DB接続・テーブル作成・マイグレーション
tasks.db                   ← SQLiteデータベースファイル（実行時に自動生成）
```

---

## 1. データベースの基礎知識

TaskFlow は **SQLite** を使用しています。

- SQLite は **1つのファイル** (`tasks.db`) に全データが入る
- サーバー不要・インストール不要（Python に標準搭載）
- バックアップは `tasks.db` をコピーするだけ

> **注意**: `tasks.db` は `.gitignore` に登録されているためGitには含まれません。
> データのバックアップは別途管理してください。

---

## 2. テーブル設計

### users テーブル — チームメンバー

```sql
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,  -- 自動採番ID
    name       TEXT     NOT NULL UNIQUE,             -- メンバー名（重複不可）
    color      TEXT     NOT NULL DEFAULT '#4A90D9',  -- カラーコード（例: #4A90D9）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- 作成日時
);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | INTEGER | 主キー（1, 2, 3... と自動で採番） |
| `name` | TEXT | メンバー名（重複不可） |
| `color` | TEXT | ガントチャートのバー色（16進カラーコード） |
| `created_at` | TIMESTAMP | 作成日時（自動入力） |

### tasks テーブル — タスク

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER  PRIMARY KEY AUTOINCREMENT,
    title           TEXT     NOT NULL,
    description     TEXT     DEFAULT '',
    assignee_id     INTEGER,                          -- users.id への参照（NULL可）
    start_date      DATE     NOT NULL,                -- 開始日（YYYY-MM-DD）
    estimated_hours REAL     NOT NULL DEFAULT 8,      -- 工数（時間単位）
    progress        INTEGER  DEFAULT 0
                    CHECK(progress >= 0 AND progress <= 100),
    priority        TEXT     DEFAULT 'medium'
                    CHECK(priority IN ('low', 'medium', 'high')),
    status          TEXT     DEFAULT 'todo'
                    CHECK(status IN ('todo', 'in_progress', 'done')),
    parent_id       INTEGER,                          -- 親タスクのID（NULL可）
    sort_order      INTEGER  DEFAULT 0,               -- 並び順
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (assignee_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL
);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | INTEGER | 主キー |
| `title` | TEXT | タスク名（必須） |
| `description` | TEXT | 詳細説明 |
| `assignee_id` | INTEGER | 担当者ID（未設定はNULL） |
| `start_date` | DATE | 開始日 `YYYY-MM-DD` 形式 |
| `estimated_hours` | REAL | 工数（時間）例: 8, 16, 4.5 |
| `progress` | INTEGER | 進捗率（0〜100） |
| `priority` | TEXT | 優先度 `low` / `medium` / `high` |
| `status` | TEXT | ステータス `todo` / `in_progress` / `done` |
| `parent_id` | INTEGER | 親タスクID（現在UIでは未使用） |
| `sort_order` | INTEGER | 表示順 |
| `created_at` | TIMESTAMP | 作成日時 |
| `updated_at` | TIMESTAMP | 最終更新日時 |

### ⚠️ end_date はDBに保存されていない

`end_date`（終了日）はDBには存在しません。
フロントエンドで `start_date + estimated_hours + 休日設定` から計算されます。

```
start_date: 2025-01-06（月）
estimated_hours: 24（24時間 = 3営業日）
holidayMode: 'weekends'
→ end_date: 2025-01-08（水）  ← 土日を除いた3日後
```

---

## 3. テーブルの関係

```
users
  id ─────────────────┐
  name                 │
  color                │ 1対多
                       │（1人が複数タスクを持てる）
tasks                  │
  id                   │
  assignee_id ─────────┘  （NULLの場合は未担当）
  parent_id ──┐            （NULLの場合は親なし）
              │ 自己参照
              └── tasks.id （親子タスク構造）
```

**外部キー制約:**

| 制約 | 動作 |
|------|------|
| `assignee_id → users(id)` | ユーザーを削除すると担当タスクの `assignee_id` は NULL に |
| `parent_id → tasks(id) ON DELETE SET NULL` | 親タスク削除時、子タスクの `parent_id` は NULL に |

> `ON DELETE CASCADE` ではないため、ユーザーや親タスクを削除してもタスク自体は残ります。

---

## 4. 初期データ

DBが新規作成された時（`users` テーブルが空の場合）、デフォルトユーザーが3名投入されます。

```python
db.executemany(
    "INSERT INTO users (name, color) VALUES (?, ?)",
    [('田中', '#4A90D9'), ('佐藤', '#E8913A'), ('鈴木', '#50B83C')],
)
```

このデータは変更・削除しても問題ありません。UIのメンバー管理から操作できます。

---

## 5. マイグレーション（DBのバージョン更新）

### マイグレーションとは？

すでに `tasks.db` が存在する状態でテーブルの構造を変更することです。
`CREATE TABLE IF NOT EXISTS` は新規作成のみで、既存テーブルには影響しないため、
カラム追加などは別途対応が必要です。

### 現在実装されているマイグレーション

旧バージョンでは `estimated_hours` の代わりに `end_date` を保存していました。
起動時に古いDBを検出して自動変換します：

```python
# database.py より
cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
if 'estimated_hours' not in cols:
    # estimated_hours カラムを追加
    db.execute("ALTER TABLE tasks ADD COLUMN estimated_hours REAL NOT NULL DEFAULT 8")
    # 旧 end_date から工数を逆算（1日=8時間として計算）
    db.execute("""
        UPDATE tasks
        SET estimated_hours = MAX(1, (julianday(end_date) - julianday(start_date) + 1) * 8)
    """)
    db.commit()
```

### 新しいカラムを追加する手順

**例: タスクに `tag` (タグ) カラムを追加したい場合**

**Step 1**: `database.py` の `CREATE TABLE` にカラムを追加

```python
# 新規DBには最初から含まれる
CREATE TABLE IF NOT EXISTS tasks (
    ...
    sort_order      INTEGER  DEFAULT 0,
    tag             TEXT     DEFAULT '',    ← 追加
    created_at      ...
```

**Step 2**: 既存DBへのマイグレーションを追加

```python
# init_db() 内のマイグレーション部分に追加
cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
if 'estimated_hours' not in cols:
    ...  # 既存のマイグレーション

# ↓ 新しいマイグレーションを追加
if 'tag' not in cols:
    db.execute("ALTER TABLE tasks ADD COLUMN tag TEXT DEFAULT ''")
    db.commit()
```

**Step 3**: `models.py` の `TASK_FIELDS` に追加

```python
TASK_FIELDS = [
    'title', 'description', 'assignee_id', 'start_date', 'estimated_hours',
    'progress', 'priority', 'status', 'parent_id', 'sort_order',
    'tag',    ← 追加
]
```

**Step 4**: フロントエンドの `TaskFormModal` にフォームフィールドを追加

---

## 6. データベースの操作方法

### SQLite の確認ツール

**コマンドラインで確認する場合:**

```bash
# SQLite コマンドラインツールで開く
sqlite3 tasks.db

# テーブル一覧を表示
.tables

# tasks テーブルの構造を表示
.schema tasks

# データを確認
SELECT * FROM tasks LIMIT 5;

# 終了
.quit
```

**GUIツール（おすすめ）:**
- [DB Browser for SQLite](https://sqlitebrowser.org/) — 無料、Windows対応
- VS Code の SQLite 拡張機能

### Pythonから直接操作する場合

```python
import sqlite3

conn = sqlite3.connect('tasks.db')
conn.row_factory = sqlite3.Row  # カラム名でアクセス可能に

# データ取得
rows = conn.execute("SELECT * FROM tasks WHERE status='todo'").fetchall()
for row in rows:
    print(dict(row))

conn.close()
```

---

## 7. よくある質問

### Q: データが消えてしまった

`tasks.db` が削除されていないか確認してください。
バックアップから復元する場合は、バックアップの `tasks.db` を元の場所にコピーしてください。

### Q: データをリセットしたい

`tasks.db` ファイルを削除して再起動すると、初期状態（デフォルトユーザー3名のみ）に戻ります。

```bash
rm tasks.db    # または手動で削除
python app.py  # 再起動で自動作成される
```

### Q: 複数人で同じDBを使いたい

SQLite はシングルプロセス前提のため、ネットワーク越しの共有には向きません。
同一PC内で使用するか、PostgreSQL/MySQL などへの移行を検討してください。
