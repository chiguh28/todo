# 拡張機能設計ドキュメント

## 対象ファイル

```
taskflow/extensions/base.py        ← 拡張の基底クラス定義
taskflow/extensions/__init__.py    ← 拡張の自動検出・登録ロジック
extensions/                        ← ユーザーが拡張を置くフォルダ
extensions/README.md               ← 拡張の作り方ガイド（簡易版）
```

---

## 1. 拡張機能システムの全体像

TaskFlow の拡張機能は**2つのレイヤー**で構成されます。

```
┌─────────────────────────────────────┐
│  フロントエンド (JSX)                │
│  ・新しいタブ画面を追加              │
│  ・タスクフォームに入力欄を追加      │
│  ・タスク一覧に列を追加              │
│  ・ヘッダーにボタンを追加            │
│  ・タスク操作のイベントを受け取る    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  バックエンド (Python)               │
│  ・新しいAPIエンドポイントを追加     │
│  ・新しいDBテーブルを追加            │
└─────────────────────────────────────┘
```

どちらか一方だけでも実装できます。
例えば「UIだけの拡張（APIなし）」も可能です。

---

## 2. 拡張のフォルダ構成

```
extensions/
  my_extension/              ← 拡張のフォルダ名（英数字とアンダースコアのみ）
    __init__.py              ← 必須（バックエンド定義）
    static/                  ← オプション（フロントエンドファイル置き場）
      my_extension.jsx       ← UIコンポーネント
      my_extension.css       ← スタイル
```

### 命名規則

| 項目 | ルール | 例 |
|------|--------|-----|
| フォルダ名 | 英数字とアンダースコアのみ | `labels`, `time_tracker` |
| `Extension.name` | フォルダ名と一致させる（推奨） | `'labels'` |
| DBテーブル名 | `ext_` プレフィクス必須 | `ext_labels`, `ext_time_logs` |
| JSXファイル名 | 拡張名と合わせる（推奨） | `labels.jsx` |

---

## 3. バックエンド — \_\_init\_\_.py の実装

### 最小構成（APIなし、DBなし）

```python
from taskflow.extensions.base import TaskFlowExtension

class Extension(TaskFlowExtension):
    name = 'my_extension'   # 必須: 一意なID
    label = 'サンプル拡張'   # 必須: 日本語表示名
    version = '1.0'

    def get_static_files(self):
        return {
            'jsx': ['my_extension.jsx'],  # フロントエンドのJSXファイル
            'css': [],                    # CSSが不要なら空リスト
        }
```

### APIあり・DBありの完全版

```python
from taskflow.extensions.base import TaskFlowExtension
from taskflow.core.database import get_db
from flask import Blueprint, jsonify, request

# Blueprint = Flask のルートグループ
# url_prefix でURLのプレフィックスを設定
bp = Blueprint('my_extension', __name__, url_prefix='/api/my-extension')

@bp.route('/items', methods=['GET'])
def get_items():
    db = get_db()
    rows = db.execute("SELECT * FROM ext_my_items").fetchall()
    return jsonify([dict(r) for r in rows])

@bp.route('/items', methods=['POST'])
def create_item():
    data = request.json
    db = get_db()
    db.execute(
        "INSERT INTO ext_my_items (task_id, value) VALUES (?, ?)",
        (data['task_id'], data['value'])
    )
    db.commit()
    return jsonify({'status': 'ok'}), 201

class Extension(TaskFlowExtension):
    name = 'my_extension'
    label = 'サンプル拡張'
    version = '1.0'

    def get_blueprint(self):
        """Flask Blueprint を返す。APIが不要なら None を返す。"""
        return bp

    def init_db(self, db):
        """
        拡張固有のテーブルを作成する。
        テーブル名は ext_ プレフィクス必須！
        """
        db.executescript("""
            CREATE TABLE IF NOT EXISTS ext_my_items (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id  INTEGER,
                value    TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
        """)
        db.commit()

    def get_static_files(self):
        return {
            'jsx': ['my_extension.jsx'],
            'css': ['my_extension.css'],
        }
```

### DBのルール

| ルール | 理由 |
|--------|------|
| テーブル名は `ext_` で始める | コアテーブルとの名前衝突を防ぐ |
| `CREATE TABLE IF NOT EXISTS` を使う | 何度起動しても安全（冪等性） |
| タスク参照は `ON DELETE CASCADE` | タスク削除時に関連データも自動削除 |

---

## 4. フロントエンド — JSXファイルの実装

### 基本構造（必ずIIFEで囲む）

```javascript
// 即時実行関数（IIFE）でスコープを分離する
// → 他の拡張やコアの変数と名前が衝突しない
(() => {
  const { useState, useEffect } = React;

  // ---- コンポーネントを定義 ----

  // ---- 拡張を登録 ----
  TaskFlow.registerExtension({
    name: 'my_extension',
    label: 'サンプル拡張',
    // ... 拡張の設定
  });
})();
```

### タブ画面を追加する

```javascript
(() => {
  const { useState } = React;

  // タブ画面のコンポーネント
  // props: { tasks, users, api, refreshTasks }
  function MyView({ tasks, users, api, refreshTasks }) {
    const [items, setItems] = useState([]);

    // 拡張のAPIを叩く例
    useEffect(() => {
      TaskFlow.api.get('/api/my-extension/items').then(setItems);
    }, []);

    return (
      <div style={{ padding: 24 }}>
        <h3>サンプル拡張</h3>
        <ul>
          {items.map(item => <li key={item.id}>{item.value}</li>)}
        </ul>
      </div>
    );
  }

  TaskFlow.registerExtension({
    name: 'my_extension',
    label: 'サンプル拡張',
    tabs: [{
      id: 'my_extension',   // ビューを識別するID
      label: 'サンプル',     // タブに表示する文字
      icon: '🔧',            // タブのアイコン（絵文字OK）
      component: MyView,     // 表示するコンポーネント
    }],
  });
})();
```

**タブコンポーネントのprops:**

| prop | 型 | 説明 |
|------|-----|------|
| `tasks` | 配列 | フィルター済みタスク（end_date 付き） |
| `users` | 配列 | 全ユーザー |
| `api` | オブジェクト | `api.get/post/put/del` ヘルパー |
| `refreshTasks` | 関数 | タスク一覧を再読み込みする関数 |

### タスクフォームに入力欄を追加する

```javascript
(() => {
  // フォームフィールドコンポーネント
  // props: { form, setForm, task, users }
  function MyFormField({ form, setForm, task, users }) {
    return (
      <div className="form-group">
        <label>追加フィールド</label>
        <input
          value={form._my_field || ''}
          onChange={e => setForm(prev => ({ ...prev, _my_field: e.target.value }))}
          placeholder="入力してください"
        />
      </div>
    );
  }

  TaskFlow.registerExtension({
    name: 'my_extension',
    label: 'サンプル拡張',
    formFields: [{ component: MyFormField }],
  });
})();
```

**フォームフィールドのprops:**

| prop | 型 | 説明 |
|------|-----|------|
| `form` | オブジェクト | 現在のフォーム入力値 |
| `setForm` | 関数 | フォーム値を更新する関数 |
| `task` | オブジェクト or null | 編集時は既存タスク |
| `users` | 配列 | 担当者の選択肢 |

> **注意**: 拡張フィールドの値はコアAPIには自動では保存されません。
> `task:created` / `task:updated` フックで受け取り、拡張のAPIに別途保存してください。

### タスク一覧に列を追加する

```javascript
TaskFlow.registerExtension({
  name: 'my_extension',
  label: 'サンプル拡張',
  columns: [{
    header: '文字数',   // 列ヘッダー
    width: 60,         // 列幅（px）
    render: (task) => <span>{task.title.length}文字</span>,  // セルの内容
  }],
});
```

### ヘッダーにボタンを追加する

```javascript
TaskFlow.registerExtension({
  name: 'my_extension',
  label: 'サンプル拡張',
  headerActions: [{
    // props: { refreshTasks }
    component: ({ refreshTasks }) => (
      <button
        className="btn btn-ghost btn-sm"
        onClick={refreshTasks}
        title="再読み込み"
      >
        🔄
      </button>
    ),
  }],
});
```

### イベントフックを使う

```javascript
TaskFlow.registerExtension({
  name: 'my_extension',
  label: 'サンプル拡張',
  hooks: {
    // タスクが作成された後
    'task:created': async (data) => {
      const task = data.task;
      console.log('タスク作成:', task.title);
      // 拡張のAPIに保存する例
      await TaskFlow.api.post('/api/my-extension/items', {
        task_id: task.id,
        value: '初期値',
      });
    },

    // タスクが更新された後
    'task:updated': (data) => {
      console.log('タスク更新:', data.task.title);
    },

    // タスクが削除された後
    'task:deleted': (data) => {
      console.log('タスク削除ID:', data.taskId);
      // ON DELETE CASCADE を使っていれば DB は自動削除される
    },
  },
});
```

**利用可能なイベント:**

| イベント | データ | 発火タイミング |
|---------|--------|--------------|
| `task:created` | `{ task }` | タスク新規作成後 |
| `task:updated` | `{ task }` | タスク更新後 |
| `task:deleted` | `{ taskId }` | タスク削除後 |

---

## 5. 拡張の読み込み仕組み（内部実装）

### discover_extensions() — 拡張を検索する

```
extensions/
  ├── my_extension/   ← サブディレクトリを走査
  │   ├── __init__.py ← あれば Python モジュールとして読み込む
  │   └── static/
  └── another_ext/
      └── __init__.py
```

読み込まれた `__init__.py` の中で以下のどちらかを探します:

```python
# パターン1: extension インスタンスが定義されている
extension = Extension()   # ← これを検索

# パターン2: Extension クラスが定義されている
class Extension(TaskFlowExtension):   # ← これを検索（自動でインスタンス化）
    ...
```

### register_extensions() — 拡張を Flask に登録する

1. `ext.init_db(db)` → DBテーブルを作成
2. `ext.get_blueprint()` → BlueprintをFlaskに登録
3. `static/` フォルダを `/extensions/{name}/static/` で配信

### フロントエンドの読み込み順序

```
index.html が返される
  ↓
app.jsx が読み込まれる（TaskFlowレジストリを定義）
  ↓
my_extension.jsx が読み込まれる（TaskFlow.registerExtension() を呼ぶ）
  ↓
another_ext.jsx が読み込まれる（同上）
  ↓
TaskFlow._boot() が呼ばれる（全拡張登録済みの状態でReact起動）
```

---

## 6. 実装例: ラベル拡張

タスクにラベル（タグ）を付ける拡張の例です。

### バックエンド (`extensions/labels/__init__.py`)

```python
from taskflow.extensions.base import TaskFlowExtension
from taskflow.core.database import get_db
from flask import Blueprint, jsonify, request

bp = Blueprint('labels', __name__, url_prefix='/api/labels')

@bp.route('/task/<int:task_id>', methods=['GET'])
def get_labels(task_id):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM ext_labels WHERE task_id = ?", (task_id,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@bp.route('/task/<int:task_id>', methods=['POST'])
def add_label(task_id):
    data = request.json
    db = get_db()
    db.execute(
        "INSERT INTO ext_labels (task_id, name, color) VALUES (?, ?, ?)",
        (task_id, data['name'], data.get('color', '#6366f1'))
    )
    db.commit()
    return jsonify({'status': 'ok'}), 201

class Extension(TaskFlowExtension):
    name = 'labels'
    label = 'ラベル管理'
    version = '1.0'

    def get_blueprint(self):
        return bp

    def init_db(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS ext_labels (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                name    TEXT NOT NULL,
                color   TEXT DEFAULT '#6366f1',
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
        """)
        db.commit()

    def get_static_files(self):
        return {'jsx': ['labels.jsx'], 'css': []}
```

### フロントエンド (`extensions/labels/static/labels.jsx`)

```javascript
(() => {
  const { useState, useEffect } = React;

  // タスク一覧の列: ラベルを表示
  function LabelCell({ task }) {
    const [labels, setLabels] = useState([]);

    useEffect(() => {
      TaskFlow.api.get(`/api/labels/task/${task.id}`).then(setLabels);
    }, [task.id]);

    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {labels.map(l => (
          <span key={l.id} style={{
            background: l.color, color: '#fff',
            borderRadius: 4, padding: '2px 6px', fontSize: 11
          }}>
            {l.name}
          </span>
        ))}
      </div>
    );
  }

  TaskFlow.registerExtension({
    name: 'labels',
    label: 'ラベル管理',
    columns: [{
      header: 'ラベル',
      width: 120,
      render: (task) => <LabelCell task={task} />,
    }],
  });
})();
```

---

## 7. よくある質問

### Q: 拡張を追加したのに反映されない

サーバーを再起動してください。拡張はサーバー起動時にのみ読み込まれます。

```bash
Ctrl + C  # サーバーを停止
python app.py  # 再起動
```

### Q: 拡張のJSXでエラーが出る

ブラウザの開発者ツール（F12 → コンソール）でエラー内容を確認してください。
また、ターミナルのサーバーログにも WARN が出ていないか確認してください。

### Q: 複数の拡張で同じ変数名を使いたい

各拡張をIIFE（即時実行関数）で囲んでいれば、変数名は衝突しません。

```javascript
(() => {
  const myData = [];   // この変数は他の拡張から見えない
  ...
})();
```

### Q: 拡張からコアのタスクデータを変更したい

コアの `/api/tasks/<id>` エンドポイントに PUT リクエストを送ります。

```javascript
await TaskFlow.api.put(`/api/tasks/${taskId}`, { status: 'done' });
```

その後 `refreshTasks()` を呼ぶとUIが更新されます。
