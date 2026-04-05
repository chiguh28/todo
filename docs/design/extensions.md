# TaskFlow 拡張機能システム設計書

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| 対象バージョン | TaskFlow 1.x |
| 作成日 | 2026-04-04 |
| 対象読者 | 拡張機能開発者、コアメンテナー |

---

## 2. 拡張機能アーキテクチャ概要

TaskFlow の拡張機能システムは、**ゼロ設定**での機能追加を実現する。`extensions/` フォルダに Python パッケージを配置するだけで、アプリ起動時に自動発見・登録される。

```
extensions/
  my_ext/
    __init__.py       ← バックエンド拡張 (TaskFlowExtension サブクラス)
    static/
      my_ext.jsx      ← フロントエンド拡張 (React コンポーネント)
      my_ext.css      ← スタイル (省略可)
```

拡張機能は以下の 2 レイヤーで構成される。

| レイヤー | 技術 | 拡張ポイント |
|----------|------|-------------|
| バックエンド | Flask + SQLite | API エンドポイント、DB テーブル |
| フロントエンド | React 18 + Babel | タブ、フォームフィールド、テーブル列、ヘッダーボタン、イベントフック |

---

## 3. バックエンド拡張設計

### 3.1 基底クラス（TaskFlowExtension）

**場所**: `taskflow/extensions/base.py`

```python
class TaskFlowExtension:
    name: str = ""      # 一意なID (URLや内部識別に使用。例: "labels")
    label: str = ""     # 日本語表示名 (例: "ラベル管理")
    version: str = "1.0"

    def get_blueprint(self):
        """Flask Blueprint を返す。APIルートが不要な場合は None を返す。"""
        return None

    def init_db(self, db):
        """
        拡張固有のテーブルを作成する。
        アプリ起動時に sqlite3 接続オブジェクトを受け取り呼び出される。
        """
        pass

    def get_static_files(self):
        """
        フロントエンドに読み込むファイル一覧を返す。
        Returns: {'jsx': ['my.jsx'], 'css': ['my.css']}
        ファイルは拡張フォルダ内の static/ から配信される。
        """
        return {'jsx': [], 'css': []}
```

3 つのメソッドはすべて省略可能（デフォルト実装は no-op）。必要なものだけオーバーライドする。

### 3.2 拡張発見プロセス（discover_extensions）

**場所**: `taskflow/extensions/__init__.py`

アプリ起動時に `create_app()` から呼び出される。

```
1. extensions/ ディレクトリが存在するか確認
2. サブディレクトリを sorted() でアルファベット順に走査
3. __init__.py が存在するサブディレクトリのみ対象とする
4. importlib.import_module('extensions.{entry}') でモジュールをインポート
5. モジュールから以下を探索:
   a. extension 変数 (インスタンス) が存在すればそれを使用
   b. なければ Extension クラスを探し、インスタンス化
6. TaskFlowExtension のサブクラスかどうかを isinstance で検証
7. name 属性が空でないことを検証
8. 検証を通過したインスタンスをリストに追加
```

インポートや検証に失敗した場合は `[WARN]` ログを出力してスキップし、アプリ全体の起動を妨げない。

### 3.3 拡張登録プロセス（register_extensions）

**場所**: `taskflow/extensions/__init__.py`

発見した拡張を Flask アプリに組み込む。アプリコンテキスト内で実行される。

```
1. ext.init_db(db): 拡張固有テーブルを作成 (sqlite3 接続を渡す)
2. ext.get_blueprint(): Flask Blueprint を app.register_blueprint() で登録
3. 静的ファイル配信:
   - 拡張パッケージの static/ ディレクトリを検出
   - Blueprint を動的生成し /extensions/{name}/static/ パスで配信
4. app.config['TASKFLOW_EXTENSIONS'] に拡張インスタンスリストを格納
```

静的ファイルの URL パターン:

```
/extensions/{ext.name}/static/{filename}
```

### 3.4 拡張一覧 API

`GET /api/extensions` — `create_app()` 内で直接定義される。

レスポンス例:
```json
[
  {
    "name": "stats_dashboard",
    "label": "統計ダッシュボード",
    "version": "1.0",
    "jsx": ["/extensions/stats_dashboard/static/stats.jsx"],
    "css": ["/extensions/stats_dashboard/static/stats.css"]
  }
]
```

`index.html` はこの情報を使って拡張の CSS/JSX を動的に読み込む。

### 3.5 DB 規約

| 規約 | 内容 |
|------|------|
| テーブル名プレフィクス | `ext_` 必須 (例: `ext_labels`, `ext_my_data`) |
| 冪等性 | `CREATE TABLE IF NOT EXISTS` を必ず使用 |
| 外部キー | コアテーブル参照時は `ON DELETE CASCADE` を付与 |
| 呼び出しタイミング | アプリ起動時に `init_db(db)` が呼ばれる |

コアテーブル参照例:
```sql
CREATE TABLE IF NOT EXISTS ext_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label TEXT NOT NULL
);
```

---

## 4. フロントエンド拡張設計

### 4.1 拡張レジストリ（TaskFlow オブジェクト）

**場所**: `taskflow/static/app.jsx` — `window.TaskFlow` として公開

```javascript
window.TaskFlow = (() => {
  const _extensions   = [];
  const _tabs         = [];   // { id, label, icon, component }
  const _formFields   = [];   // { component }
  const _columns      = [];   // { header, width, render }
  const _headerActions = [];  // { component }
  const _hooks        = {};   // { 'task:created': [fn, ...], ... }

  return {
    registerExtension(cfg) { ... },  // 拡張が呼ぶ登録 API
    emit(event, data) { ... },       // コアがイベントを発火
    get tabs()          { return _tabs; },
    get formFields()    { return _formFields; },
    get columns()       { return _columns; },
    get headerActions() { return _headerActions; },
    _boot: null,   // index.html のブートスクリプトが上書きして呼ぶ
    api: null,     // 下で api オブジェクトが注入される
  };
})();
```

レジストリはクロージャで内部状態を隠蔽しており、外部からは読み取り専用ビュー（getter）のみアクセスできる。

### 4.2 登録 API（registerExtension）

拡張の JSX ファイル内で `TaskFlow.registerExtension(cfg)` を呼び出して機能を登録する。

```javascript
TaskFlow.registerExtension({
  name:  'my_ext',   // 拡張の一意な ID
  label: 'サンプル', // 表示名

  // --- タブ追加 ---
  tabs: [
    { id: 'my_ext', label: 'タブ名', icon: '🔧', component: MyView }
  ],

  // --- タスク作成/編集フォームへのフィールド追加 ---
  formFields: [
    { component: MyFormField }
  ],

  // --- タスク一覧テーブルへの列追加 ---
  columns: [
    { header: '列名', width: 80, render: (task) => <span>{task.id}</span> }
  ],

  // --- ヘッダーへのボタン追加 ---
  headerActions: [
    { component: MyButton }
  ],

  // --- コアイベントへのフック ---
  hooks: {
    'task:created': (data) => { /* data: { task } */ },
    'task:updated': (data) => { /* data: { task } */ },
    'task:deleted': (data) => { /* data: { taskId } */ },
  },
});
```

各フィールドはすべて省略可能。必要な拡張ポイントのみ指定する。

### 4.3 拡張コンポーネントの Props 仕様

#### タブコンポーネント（tabs[].component）

```javascript
function MyView({ tasks, users, api, refreshTasks, refreshUsers }) {
  // tasks        : タスクの配列 (enrichTasks 適用済み)
  // users        : ユーザーの配列
  // api          : fetch ラッパー (get/post/put/del)
  // refreshTasks : タスク一覧を再取得する関数 () => void
  // refreshUsers : ユーザー一覧を再取得する関数 () => void
}
```

#### フォームフィールド（formFields[].component）

```javascript
function MyFormField({ form, setForm, task, users }) {
  // form    : フォームの現在値オブジェクト
  // setForm : フォーム値を更新する関数 (prev => next)
  // task    : 編集中のタスク (新規作成時は null)
  // users   : ユーザーの配列
}
```

#### ヘッダーアクション（headerActions[].component）

```javascript
function MyButton({ tasks, users, refreshTasks, refreshUsers }) {
  // tasks        : タスクの配列
  // users        : ユーザーの配列
  // refreshTasks : タスク一覧を再取得する関数 () => void
  // refreshUsers : ユーザー一覧を再取得する関数 () => void
}
```

#### 列 render 関数（columns[].render）

```javascript
columns: [
  {
    header: '列ヘッダー',
    width: 80,                          // ピクセル幅
    render: (task) => <span>{...}</span>  // ReactElement を返す
  }
]
```

### 4.4 API ヘルパー（TaskFlow.api）

`TaskFlow.api` は `fetch` をラップしたユーティリティ。拡張から直接使用できる。

```javascript
const api = TaskFlow.api;

// GET
const tasks = await api.get('/api/tasks');

// POST
const newTask = await api.post('/api/tasks', { title: '...', ... });

// PUT
const updated = await api.put(`/api/tasks/${id}`, { progress: 50 });

// DELETE
await api.del(`/api/tasks/${id}`);
```

すべてのメソッドは JSON を返す Promise。Content-Type は自動で `application/json` に設定される。

### 4.5 JSX ファイルの規約

```javascript
// 必須: IIFE でスコープを隔離
(() => {
  // React hooks はグローバルから取得
  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  // コンポーネント定義
  function MyView({ tasks, users, api, refreshTasks, refreshUsers }) {
    const [data, setData] = useState([]);
    // ...
    return <div>...</div>;
  }

  // 拡張を登録
  TaskFlow.registerExtension({
    name: 'my_ext',
    label: 'サンプル',
    tabs: [{ id: 'my_ext', label: 'タブ名', icon: '📊', component: MyView }],
  });
})();
```

| 規約 | 内容 |
|------|------|
| IIFE ラップ | 必須。グローバル汚染を防ぐ |
| React hooks | `React.useState` など、グローバル `React` オブジェクトから取得 |
| API 呼び出し | `TaskFlow.api` を使用 |
| registerExtension | IIFE の末尾で呼び出す |

### 4.6 CSS ファイルの規約

| 規約 | 内容 |
|------|------|
| スコープ | グローバル（名前衝突に注意） |
| 命名 | 拡張名をプレフィクスとして使用 (例: `.stats-card`) |
| CSS カスタムプロパティ | コアの変数を積極的に活用する |

利用可能な主要 CSS カスタムプロパティ:

```css
var(--bg-primary)      /* ページ背景 #F5F6FA */
var(--bg-secondary)    /* カード背景 #FFFFFF */
var(--bg-tertiary)     /* 薄い背景 #ECEEF3 */
var(--bg-hover)        /* ホバー背景 #E2E5EC */
var(--border)          /* ボーダー色 #D0D4DE */
var(--text-primary)    /* メインテキスト #1C1F2A */
var(--text-secondary)  /* サブテキスト #5A5F72 */
var(--text-muted)      /* 薄いテキスト #8E93A6 */
var(--accent)          /* アクセントカラー #4A74E8 */
var(--accent-hover)    /* アクセントホバー #3A62D4 */
var(--accent-dim)      /* アクセント薄色 rgba(74,116,232,0.10) */
```

---

## 5. 読み込みライフサイクル

アプリ起動から画面表示までの順序を以下に示す。

```
[サーバー起動]
  1. create_app() 実行
  2. discover_extensions('extensions/') → 拡張インスタンス一覧を取得
  3. register_extensions(app, extensions, get_db)
     a. 各拡張の init_db() でテーブル作成
     b. 各拡張の Blueprint を Flask に登録
     c. 静的ファイル配信 Blueprint を登録
  4. app.config['TASKFLOW_EXTENSIONS'] に登録済み拡張を保存

[ブラウザアクセス]
  5. GET / → index.html をレンダリング (Jinja2)
  6. <link> コアスタイル (style.css) を読み込み
  7. <link> 拡張 CSS をJinja2ループで順次読み込み
  8. <script> コア app.jsx を読み込み・実行
     → window.TaskFlow レジストリ定義
     → TaskFlow.api 注入
     → TaskFlow._boot に ReactDOM.createRoot(...).render(<App />) をセット
  9. <script> 拡張 JSX をJinja2ループで順次読み込み・実行
     → 各拡張が TaskFlow.registerExtension() を呼び出す
 10. <script> TaskFlow._boot() を実行
     → React アプリをマウント
     → App コンポーネントが TaskFlow.tabs / columns / formFields を参照して描画
```

**重要**: 拡張 JSX は app.jsx より後、`_boot()` より前に読み込まれるため、登録タイミングは保証される。

---

## 6. イベントシステム

### 6.1 コアイベント一覧

コアコンポーネント（`App`）がタスク操作後に `TaskFlow.emit()` でイベントを発火する。

| イベント名 | 発火タイミング | data の内容 |
|------------|----------------|-------------|
| `task:created` | タスク作成成功後 | `{ task }` — 作成されたタスクオブジェクト |
| `task:updated` | タスク更新成功後 | `{ task }` — 更新後のタスクオブジェクト |
| `task:deleted` | タスク削除成功後 | `{ taskId }` — 削除されたタスクの ID |

### 6.2 フック登録

```javascript
TaskFlow.registerExtension({
  hooks: {
    'task:created': ({ task }) => {
      // 例: 拡張固有の DB に関連レコードを作成
      TaskFlow.api.post(`/api/ext_my/init`, { task_id: task.id });
    },
    'task:updated': ({ task }) => {
      // 例: キャッシュを無効化
      invalidateCache(task.id);
    },
    'task:deleted': ({ taskId }) => {
      // 例: 拡張側のクリーンアップ
      TaskFlow.api.del(`/api/ext_my/task/${taskId}`);
    },
  },
});
```

### 6.3 emit の実装

```javascript
emit(event, data) {
  (_hooks[event] || []).forEach(fn => {
    try { fn(data); } catch(e) { console.error(`[TaskFlow] hook error (${event}):`, e); }
  });
}
```

個々のフックがエラーを投げても他のフックの実行を妨げない（try-catch で隔離）。

---

## 7. 実装例: stats_dashboard

統計ダッシュボード拡張は、バックエンド Blueprint や DB テーブルを持たず、フロントエンドのみの拡張の典型例。

### 7.1 バックエンド（extensions/stats_dashboard/__init__.py）

```python
from taskflow.extensions.base import TaskFlowExtension

class Extension(TaskFlowExtension):
    name    = 'stats_dashboard'
    label   = '統計ダッシュボード'
    version = '1.0'

    def get_static_files(self):
        return {'jsx': ['stats.jsx'], 'css': ['stats.css']}

    # get_blueprint() と init_db() はオーバーライド不要 (デフォルトで None/no-op)
```

### 7.2 フロントエンド構成（extensions/stats_dashboard/static/stats.jsx）

| コンポーネント | 役割 |
|---------------|------|
| `KPICard` | KPI サマリー（完了数、平均進捗率、工数消化、遅延タスク数） |
| `DonutChart` | SVG ドーナツチャート（ステータス分布、優先度分布） |
| `SCurveChart` | 計画 vs 実績の S カーブ（SVG、ResizeObserver 対応、ツールチップ） |
| `ScheduleHealth` | スケジュール健全性バー |
| `MemberStats` | メンバー別ワークロードテーブル |
| `StatsView` | 統計ダッシュボードメインコンポーネント（タブルート） |

```javascript
(() => {
  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  // ... コンポーネント定義 ...

  TaskFlow.registerExtension({
    name:  'stats_dashboard',
    label: '統計ダッシュボード',
    tabs: [{
      id:        'stats_dashboard',
      label:     '統計',
      icon:      '📊',
      component: StatsView,
    }],
    // formFields, columns, headerActions, hooks は登録しない
  });
})();
```

---

## 8. 拡張開発ガイドライン

### 8.1 最小構成（フロントエンドのみ）

バックエンドを必要としない場合、Python 側は `get_static_files()` のみ実装する。

```
extensions/my_ext/
  __init__.py   ← get_static_files() のみ実装
  static/
    my_ext.jsx  ← TaskFlow.registerExtension() を呼ぶ
```

### 8.2 フル構成（バックエンド + フロントエンド）

```
extensions/my_ext/
  __init__.py         ← Extension クラス (get_blueprint, init_db, get_static_files)
  routes.py           ← Flask Blueprint の定義 (任意)
  static/
    my_ext.jsx
    my_ext.css
```

### 8.3 Blueprint の命名規約

Blueprint 名はアプリ全体で一意でなければならない。`ext_{name}` を推奨する。

```python
def get_blueprint(self):
    bp = Blueprint('ext_my_ext', __name__)

    @bp.route('/api/ext_my_ext/items')
    def list_items():
        ...

    return bp
```

API パスは `/api/ext_{name}/` プレフィクスを推奨する。コア API（`/api/tasks`, `/api/users`）との衝突を避けるため。

### 8.4 チェックリスト

拡張をリリース前に以下を確認する。

- [ ] `name` 属性が既存拡張と重複していない
- [ ] DB テーブル名が `ext_` プレフィクスで始まる
- [ ] `CREATE TABLE IF NOT EXISTS` を使用している
- [ ] JSX ファイルが IIFE でラップされている
- [ ] React hooks を `React.useState` 等で取得している
- [ ] CSS クラス名に拡張名のプレフィクスを付けている
- [ ] Blueprint の API パスが `/api/ext_{name}/` で始まる
- [ ] 拡張のディレクトリに `__init__.py` が存在する
