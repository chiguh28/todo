# フロントエンド設計ドキュメント

## 対象ファイル

```
taskflow/static/app.jsx        ← 全Reactコンポーネントと拡張レジストリ
taskflow/static/style.css      ← 全スタイル
taskflow/templates/index.html  ← HTMLの骨格（JSX/CSSを読み込む）
```

---

## 1. 技術の概要

### ビルド不要のReact

通常のReactアプリは `npm install` や `webpack` などのビルドツールが必要ですが、
TaskFlow では **CDN から React と Babel を読み込む** ことでビルド不要にしています。

```html
<!-- index.html から抜粋 -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

<!-- type="text/babel" と書くと Babel が JSX を変換してくれる -->
<script type="text/babel" src="app.jsx"></script>
```

> **デメリット**: ブラウザがJSXを変換するため、初回表示がやや遅い。
> **メリット**: `npm` などのツール不要で、ファイルを編集するだけでOK。

---

## 2. index.html — HTMLの骨格

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <!-- CDNからReact・Babel・フォントを読み込む -->
  <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">

  <!-- 拡張機能のCSS（拡張があれば自動で挿入される） -->
  {% for ext in extensions %}
    {% for css in ext.get_static_files().get('css', []) %}
    <link rel="stylesheet" href="/extensions/{{ ext.name }}/static/{{ css }}">
    {% endfor %}
  {% endfor %}
</head>
<body>
  <div id="root"></div>  <!-- ← Reactはここにマウントされる -->

  <!-- 1. コアJSX（TaskFlowレジストリ＋全コンポーネントを定義） -->
  <script type="text/babel" src="{{ url_for('static', filename='app.jsx') }}"></script>

  <!-- 2. 拡張JSX（各拡張がTaskFlow.registerExtension()を呼ぶ） -->
  {% for ext in extensions %}
    {% for jsx in ext.get_static_files().get('jsx', []) %}
    <script type="text/babel" src="/extensions/{{ ext.name }}/static/{{ jsx }}"></script>
    {% endfor %}
  {% endfor %}

  <!-- 3. ブート（全拡張ロード後にReactを起動） -->
  <script type="text/babel">TaskFlow._boot();</script>
</body>
```

### 読み込み順序が重要

```
app.jsx 読み込み
  → TaskFlow レジストリを定義
  → 全Reactコンポーネントを定義
  → TaskFlow._boot = () => ReactDOM.createRoot(...).render(<App/>)
    （まだ render はしない！）

拡張JSX を読み込み
  → TaskFlow.registerExtension({ tabs: [...], ... }) を呼ぶ
  → タブ・フォームフィールド・カラムがレジストリに登録される

TaskFlow._boot() を呼ぶ
  → 全拡張登録済みの状態でReactアプリが起動する
```

Babel は `type="text/babel"` のスクリプトを**順番に処理**するため、この順序が保証されます。

---

## 3. app.jsx の構造

```
window.TaskFlow（拡張レジストリ）
     ↓
API ヘルパー（fetch のラッパー）
     ↓
ユーティリティ関数（日付計算、休日判定など）
     ↓
コンポーネント定義
  ├── TaskFormModal（タスク作成・編集フォーム）
  ├── UserManagerModal（メンバー管理）
  ├── TaskListView（タスク一覧テーブル）
  ├── GanttChart（ガントチャート）
  └── App（ルートコンポーネント）
     ↓
TaskFlow._boot = () => ReactDOM.createRoot(...).render(<App/>)
```

---

## 4. TaskFlow 拡張レジストリ

`window.TaskFlow` はグローバル変数として定義され、拡張機能との橋渡しをします。

```javascript
window.TaskFlow = (() => {
  // プライベートな配列（外から直接変更できない）
  const _tabs        = [];  // 追加タブ
  const _formFields  = [];  // タスクフォームの追加フィールド
  const _columns     = [];  // タスク一覧の追加列
  const _headerActions = []; // ヘッダーの追加ボタン
  const _hooks       = {};  // イベントフック

  return {
    registerExtension(cfg) { ... },  // 拡張が呼ぶ関数
    emit(event, data) { ... },       // コアがイベントを発火
    get tabs() { return _tabs; },    // 読み取り専用
    api: null,       // fetch ヘルパー（後で注入）
    _boot: null,     // 起動関数（後で定義）
  };
})();
```

### registerExtension の使い方

```javascript
TaskFlow.registerExtension({
  name: 'my_ext',
  label: '私の拡張',

  tabs: [{ id: 'my_tab', label: 'マイタブ', icon: '⭐', component: MyView }],
  formFields: [{ component: MyFormField }],
  columns: [{ header: '追加列', width: 80, render: (task) => <span>{task.title}</span> }],
  headerActions: [{ component: ({ refreshTasks }) => <button>ボタン</button> }],
  hooks: {
    'task:created': (data) => console.log('作成:', data.task.title),
    'task:updated': (data) => console.log('更新:', data.task.title),
    'task:deleted': (data) => console.log('削除:', data.taskId),
  },
});
```

---

## 5. API ヘルパー

```javascript
const api = {
  async get(url) { ... },
  async post(url, data) { ... },
  async put(url, data) { ... },
  async del(url) { ... },
};
TaskFlow.api = api;  // 拡張からも TaskFlow.api.get() で使える
```

**使い方例:**

```javascript
// タスク一覧を取得
const tasks = await api.get('/api/tasks');

// タスクを作成
const newTask = await api.post('/api/tasks', { title: 'テスト', start_date: '2025-01-01', estimated_hours: 8 });

// タスクを更新
await api.put('/api/tasks/1', { progress: 50 });

// タスクを削除
await api.del('/api/tasks/1');
```

---

## 6. ユーティリティ関数

### 日付・工数計算

```javascript
const HOURS_PER_DAY = 8;  // 1日 = 8時間

// 工数から終了日を計算（休日をスキップ）
const calcEndDate = (startDate, estimatedHours, holidayMode) => {
  let remaining = Math.ceil(estimatedHours / HOURS_PER_DAY);  // 必要な営業日数
  const d = new Date(startDate + 'T00:00:00');
  // 開始日が休日なら次の平日まで進める
  while (isHoliday(toDateStr(d), holidayMode)) d.setDate(d.getDate() + 1);
  remaining--;
  // 残り日数分を平日だけカウントしながら進める
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isHoliday(toDateStr(d), holidayMode)) remaining--;
  }
  return toDateStr(d);  // "YYYY-MM-DD" 形式で返す
};
```

### 休日判定

```javascript
// holidayMode: 'weekends' または 'weekends_holidays'
const isHoliday = (ds, mode) => {
  const dow = new Date(ds + 'T00:00:00').getDay();  // 0=日曜, 6=土曜
  if (dow === 0 || dow === 6) return true;           // 土日は常に休日
  if (mode === 'weekends_holidays' && isJapaneseHoliday(ds)) return true;
  return false;
};
```

### enrichTasks — タスクに end_date を付与

```javascript
const enrichTasks = (tasks, holidayMode) => tasks.map(t => ({
  ...t,
  end_date: calcEndDate(t.start_date, t.estimated_hours, holidayMode),
}));
```

`end_date` はDBに保存されていません。API から取得した後、この関数で計算して付与します。

---

## 7. Reactコンポーネント

### App — ルートコンポーネント

**状態（state）の管理:**

```javascript
function App() {
  const [tasks, setTasks]       = useState([]);    // 全タスクデータ
  const [users, setUsers]       = useState([]);    // 全ユーザーデータ
  const [view, setView]         = useState('list'); // 現在のタブ（list/gantt/拡張ID）
  const [holidayMode, setHolidayMode] = useState( // 休日モード（localStorage に保存）
    () => localStorage.getItem('holidayMode') || 'weekends'
  );
  // フィルター関連
  const [filterUser, setFilterUser]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterText, setFilterText]     = useState('');
  // モーダル関連
  const [editingTask, setEditingTask]   = useState(null);  // 編集中タスク
  const [showUserModal, setShowUserModal] = useState(false);
}
```

**データ取得:**

```javascript
const loadTasks = useCallback(async () => {
  const data = await api.get('/api/tasks');
  setTasks(enrichTasks(data, holidayMode));  // end_date を付与して保存
}, [holidayMode]);

useEffect(() => {
  loadTasks();
  loadUsers();
}, []);  // 初回マウント時に1回だけ実行
```

**フィルタリング（useMemo で効率化）:**

```javascript
const filteredTasks = useMemo(() => {
  return tasks.filter(t => {
    if (filterUser && t.assignee_id !== parseInt(filterUser)) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterText && !t.title.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  });
}, [tasks, filterUser, filterStatus, filterText]);
```

`useMemo` はフィルター条件やタスクが変わった時だけ再計算します（パフォーマンス最適化）。

**タスク保存（作成・更新）:**

```javascript
const handleSaveTask = async (formData) => {
  if (editingTask?.id) {
    // 更新
    const updated = await api.put(`/api/tasks/${editingTask.id}`, formData);
    TaskFlow.emit('task:updated', { task: updated });  // 拡張へイベント通知
  } else {
    // 新規作成
    const created = await api.post('/api/tasks', formData);
    TaskFlow.emit('task:created', { task: created });
  }
  await loadTasks();  // タスク一覧を再取得
};
```

**タブ切り替え（コアタブ + 拡張タブ）:**

```javascript
// コアタブ
const coreTabs = [
  { id: 'list',  label: 'タスク一覧', icon: '☰' },
  { id: 'gantt', label: 'ガントチャート', icon: '📊' },
];
// 拡張タブは TaskFlow.tabs に格納されている

// ビューの表示
const renderView = () => {
  if (view === 'list')  return <TaskListView ... />;
  if (view === 'gantt') return <GanttChart ... />;
  // 拡張タブ
  const extTab = TaskFlow.tabs.find(t => t.id === view);
  if (extTab) return <extTab.component tasks={filteredTasks} users={users} api={api} refreshTasks={loadTasks} />;
};
```

---

### TaskFormModal — タスク作成・編集フォーム

**受け取るprops:**

| prop | 型 | 説明 |
|------|-----|------|
| `task` | オブジェクト or null | 編集時は既存タスク、新規作成時は null |
| `users` | 配列 | 担当者の選択肢 |
| `holidayMode` | 文字列 | 終了日プレビュー計算に使用 |
| `onSave` | 関数 | 保存ボタン押下時に呼ばれる |
| `onClose` | 関数 | キャンセル・閉じるボタン押下時に呼ばれる |

**工数プレビューの計算:**

```javascript
const previewEndDate = useMemo(
  () => calcEndDate(form.start_date, form.estimated_hours, holidayMode),
  [form.start_date, form.estimated_hours, holidayMode]
);
const previewDays = Math.ceil(form.estimated_hours / HOURS_PER_DAY);
// → 「3営業日（2025/1/6〜2025/1/8）※1日=8時間」と表示
```

**拡張フィールドの挿入:**

```javascript
{TaskFlow.formFields.map((f, i) => (
  <f.component key={i} form={form} setForm={setForm} task={task} users={users} />
))}
```

---

### TaskListView — タスク一覧テーブル

**受け取るprops:**

| prop | 型 | 説明 |
|------|-----|------|
| `tasks` | 配列 | フィルター済みタスク（end_date 付き） |
| `users` | 配列 | ユーザー一覧 |
| `onEdit` | 関数 | 編集ボタン押下時 |
| `onDelete` | 関数 | 削除ボタン押下時 |

**拡張列の挿入:**

```javascript
// ヘッダー
{TaskFlow.columns.map((col, i) => (
  <th key={i} style={{ width: col.width }}>{col.header}</th>
))}

// データ行
{TaskFlow.columns.map((col, i) => (
  <td key={i}>{col.render(task)}</td>
))}
```

---

### GanttChart — ガントチャート

**仕組みの概要:**

```
左サイドバー                    右グリッド
┌──────────┐                ┌──────────────────────────┐
│ タスク名  │                │ 1/1 1/2 1/3 1/4 1/5 ... │
│ タスクA  │                │ ████                     │
│ タスクB  │                │      ██████              │
│ タスクC  │                │           ████████       │
└──────────┘                └──────────────────────────┘
```

**グリッドの構成:**
- 表示期間: `minDate`（最も早いタスクの開始日）〜 `maxDate`（最も遅い終了日）+ 余裕
- 各セルは1日を表す
- 土日・祝日のセルに `.weekend` クラスを付けて色を変える
- `今日` の列に赤い縦線を引く

**タスクバーの進捗編集:**

```javascript
// バーをクリックするとポップオーバーが表示される
// ポップオーバー内のスライダーで進捗率を変更
// 進捗が変わると status も自動更新
//   0% → 'todo'
//   1〜99% → 'in_progress'
//   100% → 'done'
```

**開始日ソート:**

```javascript
const [sortByDate, setSortByDate] = useState(false);
const sortedTasks = useMemo(() => {
  if (!sortByDate) return tasks;
  return [...tasks].sort((a, b) => a.start_date.localeCompare(b.start_date));
}, [tasks, sortByDate]);
```

---

## 8. style.css の構成

```css
/* CSSカスタムプロパティ（テーマカラー） */
:root {
  --bg: #0f1117;         /* 背景色（ダークテーマ） */
  --surface: #1a1d27;    /* カード・テーブルの背景 */
  --accent: #6366f1;     /* メインアクセントカラー */
  --text: #e2e8f0;       /* テキストカラー */
  --success: #10b981;    /* 完了・成功 */
  --warning: #f59e0b;    /* 警告 */
  --danger: #ef4444;     /* エラー・遅延 */
}
```

**色を変えたい場合は `:root` のカスタムプロパティを修正してください。**

### 主要なCSSクラス

| クラス | 用途 |
|--------|------|
| `.btn` | ボタンの基底スタイル |
| `.btn-primary` | メインアクションボタン |
| `.btn-ghost` | 透明背景のボタン |
| `.modal-overlay` | モーダルの背景（暗い半透明） |
| `.modal-box` | モーダルの本体 |
| `.task-row` | タスク一覧の1行 |
| `.gantt-bar` | ガントチャートのバー |
| `.badge` | ステータス・優先度バッジ |
| `.form-group` | フォームのラベル+入力欄セット |
| `.form-hint` | フォームの補助テキスト |

---

## 9. よくある修正パターン

### 画面に新しいボタンを追加したい

`App` コンポーネントのヘッダー部分に追加します:

```jsx
<div className="header-actions">
  {/* 既存のボタン */}
  <button className="btn btn-ghost btn-sm" onClick={...}>既存</button>

  {/* 新しいボタン（ここに追加） */}
  <button className="btn btn-primary btn-sm" onClick={...}>新しいボタン</button>
</div>
```

### タスク一覧に列を追加したい

1. `TaskListView` のヘッダーに `<th>` を追加
2. `TaskListView` の行レンダリングに `<td>` を追加

### フォームに新しい入力欄を追加したい

`TaskFormModal` の `return` の中に `<div className="form-group">` を追加します。

### 新しい色・スタイルを使いたい

既存の CSS カスタムプロパティを使うか、`style.css` に新しいクラスを追加します。
