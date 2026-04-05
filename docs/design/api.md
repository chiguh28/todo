# API設計書

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| 対象アプリ | TaskFlow |
| バージョン | 1.0 |
| 作成日 | 2026-04-04 |
| 対象モジュール | `taskflow/core/routes.py` |

---

## 2. API設計方針

### RESTful設計

- リソース指向のURL設計（`/api/users`, `/api/tasks` など）
- HTTPメソッドでCRUD操作を表現（GET / POST / PUT / DELETE）
- ステートレスな通信

### レスポンス形式

- 全レスポンスは **JSON** 形式（`Content-Type: application/json`）
- 一覧取得は配列 `[...]`、単一リソースはオブジェクト `{...}`
- 成功時の操作系レスポンス: `{ "status": "ok" }`

### エラーハンドリング

- エラー時は `{ "error": "エラーメッセージ" }` 形式のJSONを返す
- HTTPステータスコードでエラー種別を表現

| ステータスコード | 意味 |
|-----------------|------|
| 200 | 成功（取得・更新・削除） |
| 201 | 作成成功 |
| 400 | リクエスト不正（バリデーションエラー・重複など） |
| 404 | リソースが見つからない |
| 500 | サーバー内部エラー |

---

## 3. エンドポイント詳細

### 3.1 トップページ

#### `GET /`

| 項目 | 内容 |
|------|------|
| 説明 | フロントエンドのSPA（index.html）を配信する |
| レスポンス形式 | HTML |
| 特記事項 | 読み込まれている拡張機能のCSS/JSXファイルパスをテンプレート変数 `extensions` に渡す |

---

### 3.2 Users API

#### `GET /api/users`

| 項目 | 内容 |
|------|------|
| 説明 | 登録済みユーザーの一覧を取得する |
| リクエストボディ | なし |
| ソート | `id` 昇順 |

**レスポンス: 200 OK**

```json
[
  {
    "id": 1,
    "name": "山田太郎",
    "color": "#4A90D9",
    "created_at": "2026-04-01 09:00:00"
  }
]
```

---

#### `POST /api/users`

| 項目 | 内容 |
|------|------|
| 説明 | 新しいユーザーを作成する |
| Content-Type | `application/json` |

**リクエストボディ**

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `name` | string | 必須 | — | ユーザー名（一意制約あり） |
| `color` | string | 任意 | `"#4A90D9"` | 表示色（16進数カラーコード） |

```json
{
  "name": "山田太郎",
  "color": "#E74C3C"
}
```

**レスポンス: 201 Created**

```json
{ "status": "ok" }
```

**エラーレスポンス: 400 Bad Request**

```json
{ "error": "ユーザー名が重複しています" }
```

| 発生条件 | ステータス |
|---------|-----------|
| `name` が既存ユーザーと重複（`sqlite3.IntegrityError`） | 400 |

---

#### `DELETE /api/users/:id`

| 項目 | 内容 |
|------|------|
| 説明 | 指定したユーザーを削除する |
| パスパラメータ | `id` — 削除対象ユーザーのID（integer） |

**副作用**

- 削除されたユーザーに割り当てられていた全タスクの `assignee_id` を `NULL` に更新する

**レスポンス: 200 OK**

```json
{ "status": "ok" }
```

---

### 3.3 Tasks API

#### `GET /api/tasks`

| 項目 | 内容 |
|------|------|
| 説明 | タスク一覧を取得する（担当者情報をJOIN済み） |
| リクエストボディ | なし |
| ソート | `sort_order` → `start_date` → `id` の優先順位で昇順 |
| JOIN | `users` テーブルから `assignee_name`, `assignee_color` を付与 |

**レスポンス: 200 OK**

```json
[
  {
    "id": 1,
    "title": "要件定義",
    "description": "プロジェクトの要件を整理する",
    "assignee_id": 1,
    "start_date": "2026-04-01",
    "estimated_hours": 16,
    "progress": 50,
    "priority": "high",
    "status": "in_progress",
    "parent_id": null,
    "sort_order": 0,
    "milestone": null,
    "category": "設計",
    "created_at": "2026-04-01 09:00:00",
    "updated_at": "2026-04-02 10:30:00",
    "assignee_name": "山田太郎",
    "assignee_color": "#4A90D9"
  }
]
```

---

#### `POST /api/tasks`

| 項目 | 内容 |
|------|------|
| 説明 | 新しいタスクを作成する |
| Content-Type | `application/json` |

**リクエストボディ**

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `title` | string | 必須 | — | タスクタイトル |
| `description` | string | 任意 | `""` | タスク詳細説明 |
| `assignee_id` | integer\|null | 任意 | `null` | 担当者のユーザーID |
| `start_date` | string (DATE) | 必須 | — | 開始日（`YYYY-MM-DD` 形式） |
| `estimated_hours` | number | 任意 | `8` | 見積もり工数（時間）。1日=8時間 |
| `progress` | integer (0-100) | 任意 | `0` | 進捗率（%） |
| `priority` | string | 任意 | `"medium"` | 優先度: `"low"` / `"medium"` / `"high"` |
| `status` | string | 任意 | `"todo"` | ステータス: `"todo"` / `"in_progress"` / `"done"` |
| `parent_id` | integer\|null | 任意 | `null` | 親タスクのID（サブタスク用） |
| `sort_order` | integer | 任意 | `0` | 表示順序 |
| `milestone` | string (DATE)\|null | 任意 | `null` | マイルストーン日（`YYYY-MM-DD` 形式） |
| `category` | string | 任意 | `""` | カテゴリ名 |

```json
{
  "title": "設計書作成",
  "description": "API設計書を作成する",
  "assignee_id": 1,
  "start_date": "2026-04-05",
  "estimated_hours": 8,
  "priority": "medium",
  "category": "設計"
}
```

**レスポンス: 201 Created**

作成されたタスクオブジェクト（`GET /api/tasks` の要素と同形式、`assignee_name` / `assignee_color` を含む）

---

#### `PUT /api/tasks/:id`

| 項目 | 内容 |
|------|------|
| 説明 | 指定したタスクを更新する（部分更新対応） |
| パスパラメータ | `id` — 更新対象タスクのID（integer） |
| Content-Type | `application/json` |

**リクエストボディ**

`TASK_FIELDS` に含まれるフィールドのうち、リクエストに含まれたもののみ更新（部分更新）。

更新可能フィールド:
`title`, `description`, `assignee_id`, `start_date`, `estimated_hours`, `progress`, `priority`, `status`, `parent_id`, `sort_order`, `milestone`, `category`

```json
{
  "progress": 75,
  "status": "in_progress"
}
```

**動的SQL生成**: リクエストに含まれるフィールドのみ `SET` 句に追加。`updated_at` は自動で `CURRENT_TIMESTAMP` に更新される。

**レスポンス: 200 OK**

更新後のタスクオブジェクト（`GET /api/tasks` の要素と同形式、`assignee_name` / `assignee_color` を含む）

---

#### `DELETE /api/tasks/:id`

| 項目 | 内容 |
|------|------|
| 説明 | 指定したタスクを削除する |
| パスパラメータ | `id` — 削除対象タスクのID（integer） |

**副作用**

- 削除対象タスクの子タスク（`parent_id = 対象ID`）を先に削除する（カスケード削除）

**レスポンス: 200 OK**

```json
{ "status": "ok" }
```

---

### 3.4 Categories API

#### `GET /api/categories`

| 項目 | 内容 |
|------|------|
| 説明 | タスクに設定されているカテゴリの一覧を取得する（重複排除済み） |
| リクエストボディ | なし |
| 条件 | `category != ''` かつ `category IS NOT NULL` のみ対象 |
| ソート | カテゴリ名昇順 |

**レスポンス: 200 OK**

```json
["開発", "設計", "テスト"]
```

---

### 3.5 Extensions API

#### `GET /api/extensions`

| 項目 | 内容 |
|------|------|
| 説明 | アプリ起動時に読み込まれた拡張機能の一覧を取得する |
| リクエストボディ | なし |

**レスポンス: 200 OK**

```json
[
  {
    "name": "example_labels",
    "label": "ラベル",
    "version": "1.0",
    "jsx": ["/extensions/example_labels/static/labels.jsx"],
    "css": ["/extensions/example_labels/static/labels.css"]
  }
]
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `name` | string | 拡張機能の識別名 |
| `label` | string | UI表示名（日本語） |
| `version` | string | バージョン文字列 |
| `jsx` | string[] | JSXファイルのURLパス一覧 |
| `css` | string[] | CSSファイルのURLパス一覧 |

---

## 4. データ型定義

### Task型

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | integer | タスクID（自動採番） |
| `title` | string | タスクタイトル |
| `description` | string | 詳細説明 |
| `assignee_id` | integer\|null | 担当者のユーザーID |
| `start_date` | string (DATE) | 開始日（`YYYY-MM-DD`） |
| `estimated_hours` | number | 見積もり工数（時間）。1日=8時間として終了日を計算 |
| `progress` | integer (0-100) | 進捗率（%） |
| `priority` | string | 優先度: `"low"` / `"medium"` / `"high"` |
| `status` | string | ステータス: `"todo"` / `"in_progress"` / `"done"` |
| `parent_id` | integer\|null | 親タスクID（サブタスク用、自己参照） |
| `sort_order` | integer | 表示順序 |
| `milestone` | string (DATE)\|null | マイルストーン日（`YYYY-MM-DD`） |
| `category` | string | カテゴリ名 |
| `created_at` | string (DATETIME) | 作成日時 |
| `updated_at` | string (DATETIME) | 最終更新日時 |
| `assignee_name` | string\|null | 担当者名（JOIN付与、一覧・詳細APIのみ） |
| `assignee_color` | string\|null | 担当者カラー（JOIN付与、一覧・詳細APIのみ） |

> **注意**: `end_date` はDBに保存されない。フロントエンドで `start_date` + `estimated_hours` + `holidayMode`（週末・祝日スキップ設定）から動的に計算する。

### User型

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | integer | ユーザーID（自動採番） |
| `name` | string | ユーザー名（一意制約） |
| `color` | string | 表示色（16進数カラーコード、例: `"#4A90D9"`） |
| `created_at` | string (DATETIME) | 作成日時 |

---

## 5. 共通仕様

### Content-Type

| 通信方向 | Content-Type |
|---------|-------------|
| リクエスト（POST / PUT） | `application/json` |
| レスポンス（全エンドポイント） | `application/json`（トップページ `GET /` を除く） |

### ソート規則

| エンドポイント | ソート順 |
|--------------|---------|
| `GET /api/users` | `id` 昇順 |
| `GET /api/tasks` | `sort_order` → `start_date` → `id`（全て昇順） |
| `GET /api/categories` | カテゴリ名昇順 |

### データベース

- SQLite（WAL モード有効、外部キー制約有効）
- タスクと担当者は `LEFT JOIN` で結合（未割り当てタスクも取得可能）
- `TASK_SELECT` 定数（`taskflow/core/models.py`）で共通SELECTを管理
- `TASK_FIELDS` 定数（`taskflow/core/models.py`）で更新可能フィールドを管理

---

## 6. 拡張APIの規約

拡張機能は `extensions/` ディレクトリに配置されたPythonパッケージとして実装する。

### バックエンド拡張

- `TaskFlowExtension` 基底クラスを継承して実装
- `get_blueprint()` メソッドで独自のFlask Blueprintを返す（`None` も可）
- URL規約は拡張ごとに自由。推奨パターン: `/api/{拡張名}/`
- DBテーブルは `ext_` プレフィックス必須（例: `ext_labels`）、`CREATE TABLE IF NOT EXISTS` で冪等に作成

```python
from taskflow.extensions.base import TaskFlowExtension

class Extension(TaskFlowExtension):
    name = 'my_ext'
    label = 'マイ拡張'
    version = '1.0'

    def get_blueprint(self):
        # Flask Blueprint を返す（独自エンドポイントを /api/my_ext/ 以下に定義）
        ...

    def init_db(self, db):
        db.execute("""
            CREATE TABLE IF NOT EXISTS ext_my_ext (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER REFERENCES tasks(id)
            )
        """)

    def get_static_files(self):
        return {'jsx': ['my_ext.jsx'], 'css': ['my_ext.css']}
```

### 静的ファイル配信

拡張機能の静的ファイルは以下のURLで配信される。

```
/extensions/{拡張名}/static/{ファイル名}
```

例: `/extensions/example_labels/static/labels.jsx`

### フロントエンド拡張の登録

拡張のJSXファイルはIIFEでラップし、`TaskFlow.registerExtension()` を呼び出す。

```js
(() => {
  TaskFlow.registerExtension({
    name: 'my_ext',
    label: 'マイ拡張',
    tabs: [...],
    formFields: [...],
    columns: [...],
    headerActions: [...],
    hooks: {
      'task:created': (data) => {},
      'task:updated': (data) => {},
      'task:deleted': (data) => {},
    },
  });
})();
```

---

## 7. フロントエンドからの呼び出しパターン

フロントエンド（`taskflow/static/app.jsx`）では `api` ヘルパーオブジェクトを使用してAPIを呼び出す。拡張機能からは `TaskFlow.api` として同じヘルパーにアクセスできる。

### apiヘルパーのメソッド

| メソッド | 説明 |
|---------|------|
| `api.get(path)` | GETリクエスト。JSONを返すPromise |
| `api.post(path, body)` | POSTリクエスト。JSONボディを送信しJSONを返すPromise |
| `api.put(path, body)` | PUTリクエスト。JSONボディを送信しJSONを返すPromise |
| `api.delete(path)` | DELETEリクエスト。JSONを返すPromise |

### 呼び出し例

```js
// タスク一覧取得
const tasks = await api.get('/api/tasks');

// タスク作成
const newTask = await api.post('/api/tasks', {
  title: '新しいタスク',
  start_date: '2026-04-05',
  priority: 'high',
});

// タスク進捗更新（部分更新）
await api.put(`/api/tasks/${taskId}`, {
  progress: 100,
  status: 'done',
});

// タスク削除
await api.delete(`/api/tasks/${taskId}`);

// ユーザー作成
await api.post('/api/users', { name: '田中花子', color: '#27AE60' });

// カテゴリ一覧取得
const categories = await api.get('/api/categories');
```

### 拡張機能からの呼び出し例

```js
// 拡張機能内では TaskFlow.api を使用
const tasks = await TaskFlow.api.get('/api/tasks');
await TaskFlow.api.post('/api/my_ext/items', { task_id: 1, label: 'バグ' });
```
