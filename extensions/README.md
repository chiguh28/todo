# TaskFlow 拡張機能の作り方

拡張機能は `extensions/` フォルダ内にサブフォルダとして置きます。
サーバー再起動時に自動的に読み込まれます。

## 最小構成

```
extensions/
  my_extension/
    __init__.py
```

## `__init__.py` のテンプレート

```python
from taskflow.extensions.base import TaskFlowExtension
from taskflow.core.database import get_db
from flask import Blueprint, jsonify

bp = Blueprint('my_extension', __name__, url_prefix='/api/my-extension')

@bp.route('/hello')
def hello():
    return jsonify({'message': 'こんにちは！'})

class Extension(TaskFlowExtension):
    name = 'my_extension'       # 一意なID (英数字とアンダースコアのみ)
    label = 'サンプル拡張'       # 日本語表示名
    version = '1.0'

    def get_blueprint(self):
        """Flask Blueprint を返す。APIが不要なら None を返す。"""
        return bp

    def init_db(self, db):
        """拡張固有のテーブルを作成する。テーブル名は ext_ プレフィクス必須。"""
        db.executescript("""
            CREATE TABLE IF NOT EXISTS ext_my_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER,
                value TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
        """)
        db.commit()

    def get_static_files(self):
        """フロントエンドに読み込むファイルを返す。"""
        return {
            'jsx': ['my_extension.jsx'],
            'css': ['my_extension.css'],  # CSSが不要なら空リストでOK
        }
```

## フロントエンド (`static/my_extension.jsx`)

```jsx
// 即時実行関数でスコープを分離すること
(() => {
  const { useState, useEffect } = React;

  // ---- 新しいタブ画面 ----
  function MyView({ tasks, users, api, refreshTasks }) {
    return <div style={{ padding: 24 }}><h3>サンプル拡張</h3></div>;
  }

  // ---- タスクフォームの追加フィールド ----
  function MyFormField({ form, setForm, task, users }) {
    return (
      <div className="form-group">
        <label>追加フィールド</label>
        <input value={form._my_field || ''} onChange={e =>
          setForm(prev => ({ ...prev, _my_field: e.target.value }))
        } />
      </div>
    );
  }

  // ---- 拡張を登録 ----
  TaskFlow.registerExtension({
    name: 'my_extension',
    label: 'サンプル拡張',

    // 新しいタブを追加
    tabs: [{ id: 'my_extension', label: 'サンプル', icon: '🔧', component: MyView }],

    // タスクフォームに追加フィールドを追加
    formFields: [{ component: MyFormField }],

    // タスク一覧に追加列を追加
    columns: [{
      header: '追加列',
      width: 80,
      render: (task) => <span>{task.title.length}文字</span>,
    }],

    // ヘッダーにボタンを追加
    headerActions: [{
      component: ({ refreshTasks }) => (
        <button className="btn btn-ghost btn-sm" onClick={refreshTasks}>🔄</button>
      ),
    }],

    // コアイベントにフックする
    hooks: {
      'task:created': (data) => console.log('タスク作成:', data.task.title),
      'task:updated': (data) => console.log('タスク更新:', data.task.title),
      'task:deleted': (data) => console.log('タスク削除:', data.taskId),
    },
  });
})();
```

## 利用可能なイベントフック

| イベント | データ | タイミング |
|---------|--------|-----------|
| `task:created` | `{ task }` | タスク作成後 |
| `task:updated` | `{ task }` | タスク更新後 |
| `task:deleted` | `{ taskId }` | タスク削除後 |

## DB 規約

- テーブル名は必ず `ext_` プレフィクスを付ける (例: `ext_labels`)
- `CREATE TABLE IF NOT EXISTS` で冪等性を確保する
- コアテーブル参照時は `ON DELETE CASCADE` を使用する

## `TaskFlow.api` — フロントエンドから使える API ヘルパー

```js
await TaskFlow.api.get('/api/my-extension/data');
await TaskFlow.api.post('/api/my-extension/data', { key: 'value' });
await TaskFlow.api.put('/api/my-extension/data/1', { key: 'updated' });
await TaskFlow.api.del('/api/my-extension/data/1');
```
