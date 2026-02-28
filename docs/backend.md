# バックエンド設計ドキュメント

## 対象ファイル

```
taskflow/__init__.py       ← アプリファクトリ（起動の入り口）
taskflow/core/database.py  ← DB接続・テーブル初期化
taskflow/core/models.py    ← SQLクエリ定数
taskflow/core/routes.py    ← APIエンドポイント定義
app.py                     ← 起動スクリプト（ほぼ空）
```

---

## 1. app.py — 起動スクリプト

```python
# app.py（実際のコード）
from taskflow import create_app
app = create_app()
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
```

**やっていること（5行だけ）:**
1. `taskflow` パッケージから `create_app` 関数を読み込む
2. `create_app()` を呼んでFlaskアプリを作る
3. `python app.py` で直接実行された時だけサーバーを起動

> **ポイント**: `app.py` 自体にはロジックがほぼありません。
> すべての処理は `taskflow/` パッケージの中にあります。

---

## 2. taskflow/\_\_init\_\_.py — アプリファクトリ

**ファイルの役割**: Flask アプリを「組み立てる」関数 `create_app()` を定義します。

### create_app() の処理順序

```python
def create_app(instance_path=None):
    # 1. Flask アプリを作成
    app = Flask(__name__, ...)

    # 2. DB のパスを設定（tasks.db の場所）
    app.config['DB_PATH'] = os.path.join(instance_path, 'tasks.db')

    # 3. リクエスト終了時に DB を閉じる設定
    app.teardown_appcontext(close_db)

    # 4. テーブルを作成（存在しない場合のみ）
    with app.app_context():
        init_db()

    # 5. API ルートを登録
    register_routes(app)

    # 6. extensions/ フォルダを走査して拡張を見つける
    extensions = discover_extensions(extensions_dir)

    # 7. 拡張を Flask に登録（DB初期化・Blueprint・静的ファイル）
    register_extensions(app, extensions, get_db)

    return app
```

### app.config について

Flask の設定値は `app.config` という辞書で管理します。

| キー | 値 | 用途 |
|------|-----|------|
| `DB_PATH` | `tasks.db` の絶対パス | DB接続時に参照 |
| `TASKFLOW_EXTENSIONS` | 読み込んだ拡張のリスト | フロントエンドに返す時に参照 |

### Flask の "app_context" とは？

Flaskでは「アプリコンテキスト」という仕組みがあります。
`with app.app_context():` の中でのみ、`get_db()` や `current_app` が使えます。

```python
# 正しい使い方
with app.app_context():
    db = get_db()  # OK

# 間違い（コンテキストの外）
db = get_db()  # エラーになる
```

---

## 3. taskflow/core/database.py — DB接続

**ファイルの役割**: SQLiteデータベースへの接続を管理します。

### get_db() — DB接続を取得する

```python
def get_db():
    if 'db' not in g:              # まだ接続していなければ
        g.db = sqlite3.connect(    # 接続する
            current_app.config['DB_PATH']
        )
        g.db.row_factory = sqlite3.Row  # 結果を辞書風に扱えるようにする
        g.db.execute("PRAGMA journal_mode=WAL")    # パフォーマンス向上
        g.db.execute("PRAGMA foreign_keys=ON")     # 外部キー制約を有効化
    return g.db
```

**`g` とは？**
Flaskの `g` オブジェクトは「1回のHTTPリクエストの間だけ存在する一時保存場所」です。
同じリクエスト内で何度 `get_db()` を呼んでも、同じDB接続を使い回します。

**`row_factory = sqlite3.Row` の意味:**
```python
# これがないと
task = db.execute("SELECT * FROM tasks WHERE id=1").fetchone()
task[0]      # id を取得（インデックスでしかアクセスできない）

# これがあると
task['id']   # カラム名でアクセスできる（便利！）
dict(task)   # 辞書に変換して JSON にしやすい
```

### close_db() — DB接続を閉じる

```python
def close_db(exception=None):
    db = g.pop('db', None)   # g から取り出す（なければ None）
    if db is not None:
        db.close()
```

`app.teardown_appcontext(close_db)` の登録により、リクエストが終わるたびに自動で呼ばれます。

### init_db() — テーブルの作成

アプリ起動時に1回だけ呼ばれます。

```python
def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (...);
        CREATE TABLE IF NOT EXISTS tasks (...);
    """)
    # 旧バージョンのDBへのマイグレーション処理
    # デフォルトユーザーの初期投入（1回だけ）
```

`CREATE TABLE IF NOT EXISTS` を使うため、テーブルが既にある場合は何もしません。
**何度実行しても安全**です。

---

## 4. taskflow/core/models.py — SQLクエリ定数

```python
TASK_SELECT = """
    SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
"""

TASK_FIELDS = [
    'title', 'description', 'assignee_id', 'start_date', 'estimated_hours',
    'progress', 'priority', 'status', 'parent_id', 'sort_order',
]
```

**なぜ定数にするのか？**
- 複数の箇所で同じクエリを使うため、1か所で管理する
- タスク取得時は必ず担当者名・色も一緒に取得したいため

**`LEFT JOIN` の意味:**
担当者未設定（`assignee_id = NULL`）のタスクも取得します。
`INNER JOIN` だと担当者なしのタスクが消えてしまうので注意。

**`TASK_FIELDS` の使い道** (`routes.py` の更新処理):
```python
# PUT /api/tasks/<id> で送られたデータのうち、
# TASK_FIELDS に含まれるキーだけを UPDATE する
for key in TASK_FIELDS:
    if key in data:
        fields.append(f"{key} = ?")
        values.append(data[key])
```
これにより、未知のフィールドが送られてもSQL injectionを防げます。

> **カラムを追加したときは** `TASK_FIELDS` と `database.py` の CREATE TABLE の両方を更新してください。

---

## 5. taskflow/core/routes.py — APIエンドポイント

**ファイルの役割**: HTTP リクエストを受け取り、JSONを返す処理を定義します。

### register_routes(app) の構造

```python
def register_routes(app):
    @app.route('/')
    def index():
        ...

    @app.route('/api/users', methods=['GET'])
    def get_users():
        ...

    # 以下、各エンドポイントが続く
```

`register_routes(app)` という関数の**中**にすべてのルートを定義します。
これにより、`app` を引数として受け取って動的に登録できます。

### エンドポイント一覧

#### GET /api/users

```python
@app.route('/api/users', methods=['GET'])
def get_users():
    db = get_db()
    users = db.execute("SELECT * FROM users ORDER BY id").fetchall()
    return jsonify([dict(u) for u in users])
```

- `fetchall()` → 全行をリストで取得
- `[dict(u) for u in users]` → 各行を辞書に変換してリストにする
- `jsonify()` → 辞書リストを JSON レスポンスに変換

#### POST /api/users

```python
data = request.json  # ブラウザから送られたJSONを受け取る
db.execute(
    "INSERT INTO users (name, color) VALUES (?, ?)",
    (data['name'], data.get('color', '#4A90D9')),
)
```

- `request.json` → リクエストボディのJSON
- `?` プレースホルダー → SQLインジェクション対策（文字列を直接埋め込まない）
- `data.get('color', '#4A90D9')` → `color` がなければデフォルト値を使う

#### PUT /api/tasks/\<id\>

```python
fields, values = [], []
for key in TASK_FIELDS:
    if key in data:                          # 送られたキーだけを更新
        fields.append(f"{key} = ?")
        values.append(data[key])
if fields:
    fields.append("updated_at = CURRENT_TIMESTAMP")
    values.append(task_id)
    db.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", values)
```

- 送られたフィールドだけを UPDATE（全フィールド送信不要）
- `TASK_FIELDS` に含まれないキーは無視される（安全）
- `updated_at` は自動で現在時刻に更新

#### DELETE /api/tasks/\<id\>

```python
# 先に子タスクの parent_id を NULL にする（親を失う子を孤立させない）
db.execute("UPDATE tasks SET parent_id = NULL WHERE parent_id = ?", (task_id,))
db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
```

### エラーレスポンスの形式

```python
return jsonify({'error': 'ユーザー名が重複しています'}), 400
#                                                        ↑ HTTPステータスコード
```

- `200` → 成功（デフォルト）
- `201` → 作成成功
- `400` → リクエストが不正
- `404` → 見つからない

---

## 6. よくある修正パターン

### 新しいAPIエンドポイントを追加したい

`taskflow/core/routes.py` の `register_routes(app)` 関数内に追加します：

```python
@app.route('/api/my-feature', methods=['GET'])
def get_my_feature():
    db = get_db()
    rows = db.execute("SELECT * FROM my_table").fetchall()
    return jsonify([dict(r) for r in rows])
```

### タスクに新しいフィールドを追加したい

1. [database.md](database.md) のマイグレーション手順に従って ALTER TABLE を追加
2. `taskflow/core/models.py` の `TASK_FIELDS` に新フィールド名を追加
3. `taskflow/core/routes.py` の `create_task()` の INSERT 文に追加

### デバッグ方法

`debug=True` で起動しているため、エラーが発生するとブラウザにエラー詳細が表示されます。
また、ターミナルにもエラーが出力されます。

```python
# デバッグ用に print を使っても OK
print(f"受信データ: {data}")

# Flask のログはターミナルに自動出力される
# 127.0.0.1 - - [日時] "GET /api/tasks HTTP/1.1" 200 -
```
