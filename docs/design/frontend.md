# TaskFlow フロントエンド設計書

---

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| 文書名 | TaskFlow フロントエンド設計書 |
| 対象バージョン | 現行実装（2026年4月時点） |
| 対象ファイル | `taskflow/static/app.jsx`、`taskflow/static/style.css`、`taskflow/templates/index.html` |
| 作成日 | 2026-04-04 |

---

## 2. 技術構成

| 技術 | バージョン・詳細 |
|------|----------------|
| React | 18（CDN、production build） |
| ReactDOM | 18（CDN） |
| Babel Standalone | 最新版（CDN）、JSX をブラウザ内でトランスパイル |
| CSS | カスタムプロパティベースのライトテーマ、ビルドステップなし |
| フォント | Noto Sans JP（300/400/500/600/700）、JetBrains Mono（400/500） |
| アーキテクチャ | SPA（シングルページアプリケーション）、ビルドステップなし |
| データ通信 | Fetch API ラッパー（`api` オブジェクト） |
| 状態管理 | React 組み込み Hooks（useState、useEffect、useMemo、useRef、useCallback） |
| 永続化 | localStorage（holidayMode、ganttSidebarWidth） |

### CDN 読み込み順序

```
https://unpkg.com/react@18/umd/react.production.min.js
https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
https://unpkg.com/@babel/standalone/babel.min.js
https://fonts.googleapis.com/css2?family=Noto+Sans+JP:...&family=JetBrains+Mono:...
```

---

## 3. ブートストラップフロー

`index.html` での読み込み順序と処理内容を示す。

```
[1] CDN スクリプト読み込み
      React 18 production build
      ReactDOM 18 production build
      Babel standalone（JSX ランタイムトランスパイル）

[2] Google Fonts 読み込み
      Noto Sans JP、JetBrains Mono

[3] style.css 読み込み
      コアスタイル（CSS カスタムプロパティ + 全コンポーネントスタイル）

[4] 拡張 CSS 動的読み込み（Jinja2 ループ）
      {% for ext in extensions %}{% for css in ext.get_static_files().get('css', []) %}
      <link rel="stylesheet" href="/extensions/{{ ext.name }}/static/{{ css }}">

[5] app.jsx 読み込み（type="text/babel"）
      window.TaskFlow レジストリ定義
      api ヘルパー定義
      ユーティリティ関数定義
      全コアコンポーネント定義（レンダリングは行わない）
      TaskFlow._boot 関数を定義

[6] 拡張 JSX 動的読み込み（Jinja2 ループ）
      {% for ext in extensions %}{% for jsx in ext.get_static_files().get('jsx', []) %}
      各拡張が TaskFlow.registerExtension() を呼び出す

[7] ブートスクリプト実行
      <script type="text/babel">TaskFlow._boot();</script>
      ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

**設計上のポイント:** 拡張 JSX は app.jsx より後に読み込まれるため、拡張が `TaskFlow.registerExtension()` を呼ぶ時点でレジストリが確実に存在する。`_boot` 呼び出しは全拡張ロード後なので、拡張タブ・フォームフィールド・列がすべて登録済みの状態で React ツリーが構築される。

---

## 4. コンポーネント構成図

```
App（ルートコンポーネント、921行目〜）
├── [Header インライン]
│   ├── app-logo（ロゴ + アプリ名）
│   ├── tab-group（タブ切替）
│   │   ├── タスク一覧タブ
│   │   ├── ガントチャートタブ
│   │   └── 拡張タブ（TaskFlow.tabs から動的生成）
│   └── header-actions（右側アクション群）
│       ├── 拡張ヘッダーアクション（TaskFlow.headerActions）
│       ├── メンバーボタン
│       └── 新規タスクボタン
│
├── [FilterBar インライン]
│   ├── SearchInput（テキスト検索）
│   ├── MultiSelectDropdown（担当者フィルター）
│   ├── MultiSelectDropdown（ステータスフィルター）
│   ├── MultiSelectDropdown（カテゴリフィルター）
│   ├── select（休日モード切替）
│   └── クリアボタン（フィルター適用時のみ表示）
│
├── [MainContent インライン]
│   ├── TaskListView（view === 'tasks'）
│   ├── GanttChart（view === 'gantt'）
│   └── 拡張ビュー（renderExtView()、view === 拡張タブ ID）
│
├── TaskFormModal（showTaskForm === true 時）
│   ├── フォームフィールド群（title、description、assignee、priority、status...）
│   ├── カテゴリ選択（既存 or 新規入力）
│   ├── 終了日プレビュー（calcEndDate による計算結果表示）
│   ├── マイルストーン入力
│   ├── 進捗スライダー
│   └── 拡張フォームフィールド（TaskFlow.formFields から動的生成）
│
└── UserManagerModal（showUserManager === true 時）
    ├── メンバー一覧（削除ボタン付き）
    └── 新規メンバー追加フォーム

独立コンポーネント:
├── MultiSelectDropdown（複数選択ドロップダウン、FilterBar 内で使用）
├── TaskListView（タスク一覧テーブル）
└── GanttChart（ガントチャート）
```

---

## 5. 各コンポーネント詳細

### 5.1 MultiSelectDropdown

**責務:** 複数の選択肢をチェックボックス形式で選べるドロップダウン UI を提供する。

**Props:**

| Prop | 型 | 説明 |
|------|----|------|
| `label` | string | ボタンに表示するラベル |
| `options` | `{value, label}[]` | 選択肢一覧 |
| `selected` | string[] | 選択済み値の配列 |
| `onChange` | (string[]) => void | 選択変更時コールバック |

**State:**

| 名前 | 型 | 初期値 | 説明 |
|------|----|--------|------|
| `open` | boolean | false | ドロップダウンの開閉状態 |

**主要ロジック:**
- `useRef` + `useEffect` で外部クリック検知（`document.addEventListener('mousedown', ...)`）。`open` が true の間のみリスナーを登録し、クリーンアップ関数で解除する。
- 選択済み件数が 1 以上の場合、ボタンラベルに `(N)` を追加し `has-selection` クラスを付与してスタイルを変える。
- `toggle(val)`: 既に選択済みなら除去、未選択なら追加。

---

### 5.2 TaskFlow（グローバルレジストリ）

**責務:** 拡張機能の登録・管理・イベント発火・API 公開を行うグローバルシングルトン。IIFE で `window.TaskFlow` として定義。

**内部データ（クロージャ変数）:**

| 変数 | 型 | 説明 |
|------|----|------|
| `_extensions` | array | 登録済み拡張一覧 |
| `_tabs` | `{id, label, icon, component}[]` | 拡張タブ配列 |
| `_formFields` | `{component}[]` | TaskFormModal への追加フィールド |
| `_columns` | `{header, width, render}[]` | TaskListView への追加列 |
| `_headerActions` | `{component}[]` | ヘッダーへの追加ボタン |
| `_hooks` | `{[event]: fn[]}` | イベントフック管理マップ |

**公開 API:**

| メンバー | 種別 | 説明 |
|----------|------|------|
| `registerExtension(cfg)` | method | 拡張を登録。tabs/formFields/columns/headerActions/hooks を各配列にマージ |
| `emit(event, data)` | method | 指定イベントの全フックを try-catch 付きで順次呼び出し |
| `tabs` | getter | `_tabs` の読み取り専用参照 |
| `formFields` | getter | `_formFields` の読み取り専用参照 |
| `columns` | getter | `_columns` の読み取り専用参照 |
| `headerActions` | getter | `_headerActions` の読み取り専用参照 |
| `api` | property | fetch ラッパー（app.jsx 初期化時に注入） |
| `_boot` | property | `ReactDOM.createRoot().render(<App />)` 関数（app.jsx 末尾で定義） |

**発火するイベント:**

| イベント名 | 発火タイミング | データ |
|------------|----------------|--------|
| `task:created` | タスク新規作成後 | `{ task: savedTask }` |
| `task:updated` | タスク更新後 | `{ task: savedTask }` |
| `task:deleted` | タスク削除後 | `{ taskId: id }` |

---

### 5.3 api（フェッチラッパー）

**責務:** fetch API の薄いラッパー。JSON の送受信を一元化する。`TaskFlow.api` として拡張からも参照可能。

```js
api.get(url)          // GET → JSON
api.post(url, data)   // POST JSON → JSON
api.put(url, data)    // PUT JSON → JSON
api.del(url)          // DELETE → JSON
```

---

### 5.4 TaskFormModal（251行目〜）

**責務:** タスクの新規作成・編集・サブタスク作成の 3 モードに対応するモーダルフォーム。

**Props:**

| Prop | 型 | 説明 |
|------|----|------|
| `task` | object \| null | 編集タスク。新規は null、サブタスクは `{parent_id, start_date, category}` |
| `users` | User[] | 担当者選択肢 |
| `holidayMode` | string | 終了日計算に使う休日モード |
| `categories` | string[] | 既存カテゴリ一覧 |
| `onSave` | (formData) => void | 保存時コールバック |
| `onClose` | () => void | 閉じるコールバック |

**モード判定:**

| 変数 | 条件 | 説明 |
|------|------|------|
| `isEdit` | `task?.id` が truthy | 編集モード |
| `isSubtask` | `task?.parent_id` が truthy かつ `!isEdit` | サブタスク作成モード |

**State:**

| 名前 | 型 | 初期値 | 説明 |
|------|----|--------|------|
| `form` | object | タスク値 or デフォルト値 | フォーム全フィールド |
| `newCategory` | string | `''` | 新規カテゴリ入力値 |

**form オブジェクトのフィールド:**

| フィールド | 型 | 初期値 |
|------------|-----|--------|
| `title` | string | `task?.title \|\| ''` |
| `description` | string | `task?.description \|\| ''` |
| `assignee_id` | string | `task?.assignee_id \|\| ''` |
| `start_date` | string | `task?.start_date \|\| today` |
| `estimated_hours` | number | `task?.estimated_hours \|\| 8` |
| `progress` | number | `task?.progress \|\| 0` |
| `priority` | string | `task?.priority \|\| 'medium'` |
| `status` | string | `task?.status \|\| 'todo'` |
| `milestone` | string | `task?.milestone \|\| ''` |
| `category` | string | `task?.category \|\| ''` |

**主要ロジック:**
- `previewEndDate`: `useMemo` で `calcEndDate(start_date, estimated_hours, holidayMode)` を計算。フォーム入力の変化に反応してリアルタイム更新。
- `previewDays`: `Math.ceil(estimated_hours / HOURS_PER_DAY)` で営業日数を表示。
- カテゴリ選択: `select` で既存カテゴリを選択、`'__new__'` を選んだ場合はテキスト入力欄を表示して自由入力。
- `handleSubmit`: title・start_date・estimated_hours のバリデーション後、`onSave` を呼び出す。
- 拡張フォームフィールド: `TaskFlow.formFields` を走査し、各 `field.component` を `<Field form={form} setForm={setForm} task={task} users={users} />` として描画。

---

### 5.5 UserManagerModal（406行目〜）

**責務:** チームメンバーの一覧表示・追加・削除を行うモーダル。

**Props:**

| Prop | 型 | 説明 |
|------|----|------|
| `users` | User[] | 現在のメンバー一覧 |
| `onClose` | () => void | 閉じるコールバック |
| `onRefresh` | () => void | ユーザー一覧再取得コールバック |

**State:**

| 名前 | 型 | 初期値 | 説明 |
|------|----|--------|------|
| `name` | string | `''` | 新規メンバー名入力 |
| `color` | string | `USER_COLORS[users.length % 7]` | カラーピッカー値 |

**主要ロジック:**
- `handleAdd`: 名前が空でなければ `POST /api/users` を呼び出し、`onRefresh()` で親を更新。
- `handleDelete`: `confirm()` 確認後 `DELETE /api/users/:id` を呼び出す。削除するとそのユーザーのタスクの `assignee_id` は NULL になる（バックエンド側の仕様）。
- Enter キーで追加（`onKeyDown` で `handleAdd` を呼び出す）。

---

### 5.6 TaskListView（457行目〜）

**責務:** フィルター済みタスクを親子ツリー構造で表形式に表示する。統計サマリー、拡張列、サブタスク行を含む。

**Props:**

| Prop | 型 | 説明 |
|------|----|------|
| `tasks` | Task[] | enriched + filtered なタスク一覧 |
| `users` | User[] | ユーザー情報（現在は未使用、拡張列用） |
| `onEdit` | (task) => void | 行クリック・編集ボタン押下時 |
| `onDelete` | (id) => void | 削除ボタン押下時 |
| `onAddSubtask` | (parentTask) => void | サブタスク追加ボタン押下時 |

**統計計算（親タスクのみを対象）:**

| 統計 | 計算方法 |
|------|---------|
| 全タスク数 | `tasks.filter(t => !t.parent_id).length` |
| 完了数 | 親タスクのうち `status === 'done'` の件数 |
| 平均進捗 | 親タスクの `progress` 合計 ÷ 親タスク数 |

**`buildTree(taskList)` ロジック:**
1. 親タスク（`!parent_id`）と子タスクを分離。
2. `childMap` を `{ [parent_id]: childTasks[] }` 形式で構築。
3. 親タスクを走査し、各親の直後に子タスクを `{ ...child, _isSubtask: true }` として挿入。
4. 結果を `useMemo` でメモ化。

**テーブル列構成:**

| 列 | 幅 | 内容 |
|----|----|------|
| No. | 30px | 親タスクのみ連番（`_isSubtask` は空白） |
| タスク名 | 可変 | クリックで編集。サブタスクは左 32px インデント + `└` プレフィックス |
| カテゴリ | 80px | `category-badge` または `—` |
| 担当 | 80px | `assignee-chip`（カラードット + 名前）または `—` |
| 優先度 | 60px | `priority-badge`（high/medium/low） |
| ステータス | 70px | `status-badge`（todo/in_progress/done） |
| 期間 | 130px | 開始日〜終了日、工数時間、遅延バッジ、ずらし表示 |
| 進捗 | 130px | ミニ進捗バー + パーセント数値（色は `getProgressColor`） |
| マイルストーン | 100px | 🚩 + 日付、超過時は `milestone-overdue` スタイル |
| 拡張列 | 可変 | `TaskFlow.columns` から動的生成 |
| アクション | 100px | サブタスク追加（親のみ）、編集、削除ボタン |

---

### 5.7 GanttChart（603行目〜）

**責務:** タスクのスケジュールをガントチャートで可視化する。左サイドバー（リサイズ可能）と右チャートエリアで構成される。

**Props:**

| Prop | 型 | 説明 |
|------|----|------|
| `tasks` | Task[] | enriched + filtered なタスク一覧 |
| `users` | User[] | 現在は未使用（将来拡張用） |
| `holidayMode` | string | 休日モード（チャートの背景色に使用） |
| `onUpdateProgress` | (taskId, progress) => void | 進捗ポップオーバーの保存時 |
| `onEdit` | (task) => void | サイドバー行クリック時 |

**State:**

| 名前 | 型 | 初期値 | 説明 |
|------|----|--------|------|
| `popover` | object \| null | null | 進捗編集ポップオーバーの表示情報 |
| `sortByDate` | boolean | false | 開始日順ソートの有無 |
| `groupByCategory` | boolean | false | カテゴリ別グループ表示の有無 |
| `sidebarWidth` | number | 280（localStorage 復元） | サイドバー幅（px） |

**定数:**

| 定数 | 値 | 説明 |
|------|----|------|
| `DAY_WIDTH` | 36 | 1日あたりのチャート幅（px） |

**`sortedTasks` の構築ロジック（useMemo）:**
1. 親タスクとサブタスクを分離し `childMap` を構築。
2. `sortByDate` が true の場合、親タスクを `start_date` 昇順ソート。
3. `groupByCategory` が true の場合:
   - カテゴリ別に親タスクをグループ化。
   - カテゴリ名昇順で `{ _isCategoryHeader: true, _categoryName }` ヘッダー行を挿入。
   - 未カテゴリタスクは `未分類` グループとして末尾に追加。
4. それ以外はフラットに親→子の順で並べる。

**`dateRange` の計算（useMemo）:**
- タスクが 0 件の場合: 今日 -7 日〜 +30 日。
- タスクがある場合: 全タスクの `shifted_start_date`、`end_date`、`milestone` から最小・最大を求め、前後にマージン（-5 日、+10 日）を付加。

**サイドバーリサイズ:**
- `handleResizeStart`: mousedown で開始。`document.addEventListener('mousemove', onMove)` + `document.addEventListener('mouseup', onUp)` でドラッグ追従。
- 幅の範囲: 最小 150px 〜 最大 600px。
- mouseup 時に `localStorage.setItem('ganttSidebarWidth', w)` で幅を永続化。

**スクロール同期:**
- `chartRef`（チャートエリア）のスクロールイベントで `sidebarBodyRef.current.scrollTop` を同期。
- 初回レンダリング時、今日ラインが中央付近に来るよう `chartRef.current.scrollLeft` を自動設定。

**タスクバーの描画:**

| 要素 | 説明 |
|------|------|
| 上段バー（`gantt-bar-schedule`） | スケジュールバー。担当者カラーで塗りつぶし。遅延時は `gantt-bar-overdue`（パルスアニメーション） |
| 下段バー（`gantt-bar-actual`） | 進捗バー。幅 = `progress%`、色 = `getProgressColor(task)` |
| ずらしバー | `shifted_start_date !== start_date` の場合、破線ボーダー + `⇢` アイコン表示 |
| サブタスクバー | 高さを小さく（schedule: 14px、actual: 4px）、背景透過を強化 |
| マイルストーンマーカー | 🚩 絶対位置配置。超過時は `gantt-milestone-overdue` スタイル（点滅） |
| 今日ライン | `today-line` クラス、`--today-line`（ピンク）色の縦線 |

**進捗ポップオーバー:**
- タスクバークリックで `popover` state に `{ task, x, y, progress }` をセット。
- range input でリアルタイム進捗プレビュー。
- 保存時に `onUpdateProgress(task.id, progress)` を呼び出す。
- オーバーレイ（`position:fixed, inset:0`）クリックで閉じる。

---

### 5.8 App（921行目〜）

**責務:** アプリのルートコンポーネント。全体の状態管理、データフェッチ、フィルタリング、モーダル制御を担う。

**State:**

| 名前 | 型 | 初期値 | 説明 |
|------|----|--------|------|
| `view` | string | `'tasks'` | 現在のタブ（`'tasks'`/`'gantt'`/拡張 ID） |
| `tasks` | Task[] | `[]` | サーバーから取得した生のタスク一覧 |
| `users` | User[] | `[]` | サーバーから取得したユーザー一覧 |
| `categories` | string[] | `[]` | サーバーから取得したカテゴリ一覧 |
| `showTaskForm` | boolean | false | TaskFormModal の表示制御 |
| `editingTask` | Task \| null | null | 編集中タスク（null は新規作成） |
| `showUserManager` | boolean | false | UserManagerModal の表示制御 |
| `filterAssignees` | string[] | `[]` | 担当者フィルター（ユーザー ID 文字列の配列） |
| `filterStatuses` | string[] | `[]` | ステータスフィルター |
| `filterCategories` | string[] | `[]` | カテゴリフィルター |
| `searchQuery` | string | `''` | テキスト検索クエリ |
| `holidayMode` | string | localStorage or `'weekends'` | 休日モード |
| `subtaskParent` | Task \| null | null | サブタスク作成時の親タスク |

**派生データ（useMemo）:**

| 名前 | 説明 |
|------|------|
| `enrichedTasks` | `enrichTasks(tasks, holidayMode)` — end_date と shifted_start_date を付与 |
| `filteredTasks` | `enrichedTasks` にフィルター・検索を適用した結果 |

**フィルタリングロジック（filteredTasks）:**
1. `filterAssignees` が指定されている場合、`t.assignee_id` の文字列表現が一致しないタスクを除外。
2. `filterStatuses` が指定されている場合、`t.status` が一致しないタスクを除外。
3. `filterCategories` が指定されている場合:
   - サブタスクは親タスクのカテゴリで判定（親が条件を満たさなければサブタスクも除外）。
   - 親タスクは `t.category` で判定。
4. `searchQuery` が指定されている場合、`t.title.toLowerCase()` に部分一致しないタスクを除外。

**主要ハンドラー:**

| ハンドラー | 処理内容 |
|-----------|---------|
| `fetchTasks` | `GET /api/tasks` → `setTasks` |
| `fetchUsers` | `GET /api/users` → `setUsers` |
| `fetchCategories` | `GET /api/categories` → `setCategories` |
| `handleHolidayModeChange(mode)` | `setHolidayMode` + `localStorage.setItem('holidayMode', mode)` |
| `handleSaveTask(formData)` | 新規: `POST /api/tasks` → `emit('task:created')`。編集: `PUT /api/tasks/:id` → `emit('task:updated')`。サブタスクの場合は `updateParentProgress` も呼び出す。最後に `fetchTasks`・`fetchCategories` |
| `handleDeleteTask(id)` | `confirm()` 確認 → `DELETE /api/tasks/:id` → `emit('task:deleted')`。サブタスク削除時は残サブタスクの平均から親の進捗を再計算して PUT。最後に `fetchTasks`・`fetchCategories` |
| `handleEditTask(task)` | `setEditingTask(task)` + `setShowTaskForm(true)` |
| `handleAddSubtask(parentTask)` | `setSubtaskParent(parentTask)` + `setShowTaskForm(true)` |
| `handleUpdateProgress(taskId, progress)` | `PUT /api/tasks/:id` でステータス自動設定（0%→todo、1-99%→in_progress、100%→done）。サブタスクの場合は親の平均進捗も更新。最後に `fetchTasks` |
| `updateParentProgress(parentId)` | 子タスクの平均進捗を計算して親タスクを `PUT` |
| `renderExtView()` | `TaskFlow.tabs.find(t.id === view)` で拡張コンポーネントを取得し描画 |

**サブタスク作成時の TaskFormModal への引数:**

親の開始日・カテゴリを初期値として引き継ぐ。

```js
task={subtaskParent ? {
  parent_id: subtaskParent.id,
  start_date: subtaskParent.start_date,
  category: subtaskParent.category
} : editingTask}
```

---

## 6. 拡張レジストリ設計

### 6.1 拡張登録フロー

```
拡張 JSX ファイル（IIFE）
  └─ TaskFlow.registerExtension(cfg) 呼び出し
       ├─ cfg.tabs          → _tabs に push（スプレッド）
       ├─ cfg.formFields    → _formFields に push
       ├─ cfg.columns       → _columns に push
       ├─ cfg.headerActions → _headerActions に push
       └─ cfg.hooks         → _hooks[event] 配列に push
```

### 6.2 拡張コンポーネントへの Props

**拡張タブ（`tab.component`）:**

```js
<ExtComponent
  tasks={enrichedTasks}        // end_date・shifted_start_date 付きタスク
  users={users}                // ユーザー一覧
  api={api}                    // fetch ラッパー
  refreshTasks={fetchTasks}    // タスク再取得関数
  refreshUsers={fetchUsers}    // ユーザー再取得関数
/>
```

**拡張ヘッダーアクション（`action.component`）:**

```js
<Action
  tasks={enrichedTasks}
  users={users}
  refreshTasks={fetchTasks}
  refreshUsers={fetchUsers}
/>
```

**拡張フォームフィールド（`field.component`）:**

```js
<Field
  form={form}         // 現在のフォーム状態
  setForm={setForm}   // フォーム状態更新関数
  task={task}         // 編集対象タスク（新規は null）
  users={users}       // ユーザー一覧
/>
```

**拡張テーブル列（`col.render`）:**

```js
col.render(task)  // タスクオブジェクトを受け取り JSX を返す関数
```

### 6.3 拡張 JSX の必須形式

```js
(() => {
  // コンポーネント定義...
  TaskFlow.registerExtension({
    name: 'my_ext',
    label: 'サンプル',
    tabs: [{ id: 'my_ext', label: 'タブ名', icon: '🔧', component: MyView }],
    formFields: [{ component: MyFormField }],
    columns: [{ header: '列名', width: 80, render: (task) => <span /> }],
    headerActions: [{ component: MyButton }],
    hooks: {
      'task:created': (data) => {},
      'task:updated': (data) => {},
      'task:deleted': (data) => {},
    },
  });
})();
```

---

## 7. ユーティリティ関数一覧

### 7.1 日付・工数関連

| 関数名 | シグネチャ | 説明 |
|--------|-----------|------|
| `formatDate` | `(d: string) => string` | `ja-JP` ロケールで `月日` 形式に変換（例: `4月1日`） |
| `toDateStr` | `(d: Date \| string) => string` | Date オブジェクトを `YYYY-MM-DD` 文字列に変換。文字列はそのまま返す |
| `daysBetween` | `(a: string, b: string) => number` | 2 つの日付文字列の差を日数（整数）で返す |
| `calcEndDate` | `(startDate, estimatedHours, holidayMode) => string` | 開始日と工数から終了日を計算。1日=8時間として営業日ベースで算出。休日をスキップ |

**`calcEndDate` アルゴリズム:**
1. `Math.ceil(estimatedHours / 8)` で必要営業日数を算出。
2. 開始日が休日の場合、次の営業日まで進める（1日消費）。
3. 残日数が 0 になるまで翌日へ進め、休日はスキップ。

### 7.2 祝日判定

| 関数名 | シグネチャ | 説明 |
|--------|-----------|------|
| `getJapaneseHolidays` | `(year: number) => Set<string>` | 指定年の日本の祝日 Set を返す。振替休日含む |
| `isJapaneseHoliday` | `(ds: string) => boolean` | 年単位でキャッシュ（`_holidayCache`）して祝日判定 |
| `isHoliday` | `(ds: string, mode: string) => boolean` | `weekends`: 土日のみ。`weekends_holidays`: 土日祝 |

**`getJapaneseHolidays` が計算する祝日（固定日 + ハッピーマンデー）:**
- 元日、成人の日（第 2 月曜）、建国記念日、天皇誕生日
- 春分の日（概算計算式）
- 昭和の日、憲法記念日、みどりの日、こどもの日
- 海の日（第 3 月曜）、山の日、敬老の日（第 3 月曜）
- 秋分の日（概算計算式）
- スポーツの日（第 2 月曜）、文化の日、勤労感謝の日
- 振替休日（祝日が日曜の場合、翌平日が振替休日）

### 7.3 タスクスケジューリング

| 関数名 | シグネチャ | 説明 |
|--------|-----------|------|
| `shiftOverlappingTasks` | `(tasks, holidayMode) => Task[]` | 担当者ごとに同一日で工数が重複するタスクの開始日を自動ずらし |
| `enrichTasks` | `(tasks, holidayMode) => Task[]` | `shiftOverlappingTasks` 後に各タスクへ `end_date`・`shifted_start_date` を付与 |

**`shiftOverlappingTasks` アルゴリズム:**
1. タスクを担当者ごとにグループ化（未割当は別扱い）。
2. 各グループを `start_date → sort_order → id` の順にソート。
3. `nextAvailable`（担当者が次に空く稼働日）を追跡。タスクの開始日が `nextAvailable` より前なら `shifted_start_date = nextAvailable`。
4. 各タスクの終了日を計算し、終了翌営業日を `nextAvailable` に更新。
5. 未割当タスクはずらし処理なし（通常の `calcEndDate` のみ適用）。

### 7.4 スケジュールステータス

| 関数名 | シグネチャ | 説明 |
|--------|-----------|------|
| `getScheduleStatus` | `(task) => string` | `done`/`overdue`/`due-soon`/`on-track` を返す |
| `getProgressColor` | `(task) => string` | タスク状態に応じた CSS カラー変数文字列を返す |

**`getScheduleStatus` 判定ロジック（優先度順）:**

| 優先度 | 条件 | 戻り値 |
|--------|------|--------|
| 1 | `task.status === 'done'` | `'done'` |
| 2 | `task.end_date < today` | `'overdue'` |
| 3 | `daysBetween(today, end_date) <= 2` | `'due-soon'` |
| 4 | それ以外 | `'on-track'` |

**`getProgressColor` 判定ロジック:**

| 条件 | 色 |
|------|-----|
| `progress >= 100` または `status === 'done'` | `var(--success)`（緑） |
| `overdue` | `var(--danger)`（赤） |
| `due-soon` かつ `progress < 80` | `var(--warning)`（橙） |
| `progress >= 50` | `var(--accent)`（青） |
| それ以外 | `var(--warning)`（橙） |

### 7.5 定数

| 定数 | 値 | 説明 |
|------|----|------|
| `HOURS_PER_DAY` | `8` | 1営業日の時間数 |
| `DAY_WIDTH` | `36` | ガントチャート 1 日あたりの幅（px） |
| `USER_COLORS` | 7 色配列 | ユーザー追加時のデフォルトカラーパレット |
| `PRIORITY_LABELS` | `{high:'高', medium:'中', low:'低'}` | 優先度の日本語ラベル |
| `STATUS_LABELS` | `{todo:'未着手', in_progress:'進行中', done:'完了'}` | ステータスの日本語ラベル |
| `SCHEDULE_BADGES` | `{overdue:'遅延', 'due-soon':'期限近'}` | スケジュールバッジ文字列 |

---

## 8. CSS デザインシステム（style.css）

### 8.1 CSS カスタムプロパティ（:root）

#### カラートークン

| 変数 | 値 | 用途 |
|------|----|------|
| `--bg-primary` | `#F5F6FA` | ページ背景 |
| `--bg-secondary` | `#FFFFFF` | カード・ヘッダー背景 |
| `--bg-tertiary` | `#ECEEF3` | 入力フィールド背景、偶数行 |
| `--bg-hover` | `#E2E5EC` | ホバー状態 |
| `--border` | `#D0D4DE` | ボーダー全般 |
| `--text-primary` | `#1C1F2A` | メインテキスト |
| `--text-secondary` | `#5A5F72` | サブテキスト、ラベル |
| `--text-muted` | `#8E93A6` | プレースホルダー、補助テキスト |
| `--accent` | `#4A74E8` | アクションカラー（ボタン、リンク、フォーカス） |
| `--accent-hover` | `#3A62D4` | アクセントのホバー |
| `--accent-dim` | `rgba(74,116,232,0.10)` | アクセントの薄い背景 |
| `--danger` | `#E04E4E` | 削除・エラー・遅延 |
| `--danger-dim` | `rgba(224,78,78,0.10)` | 危険の薄い背景 |
| `--success` | `#28A070` | 完了・成功 |
| `--success-dim` | `rgba(40,160,112,0.10)` | 成功の薄い背景 |
| `--warning` | `#D48E1C` | 警告・期限近・中優先度 |
| `--warning-dim` | `rgba(212,142,28,0.10)` | 警告の薄い背景 |
| `--high` | `#E04E4E` | 高優先度 |
| `--medium` | `#D48E1C` | 中優先度 |
| `--low` | `#28A070` | 低優先度 |
| `--today-line` | `#E0396E` | ガント今日ライン |
| `--gantt-weekend` | `rgba(0,0,0,0.03)` | ガント休日セル背景 |

#### シェイプ・タイポグラフィトークン

| 変数 | 値 | 用途 |
|------|----|------|
| `--radius` | `8px` | 標準角丸 |
| `--radius-lg` | `12px` | モーダル等の大きい角丸 |
| `--shadow` | `0 2px 8px rgba(0,0,0,0.08)` | 標準シャドウ |
| `--font` | `'Noto Sans JP', sans-serif` | UI フォント |
| `--mono` | `'JetBrains Mono', monospace` | 数値・コード用フォント |

### 8.2 コンポーネントスタイル

#### ベースレイアウト
- `body`: `overflow: hidden`、`height: 100vh`（スクロールをコントロール）
- `#root`: `display: flex; flex-direction: column; height: 100vh`

#### Header（`.app-header`）
- flexbox、`justify-content: space-between`
- ロゴ（グラデーションアイコン + テキスト）、タブグループ、ヘッダーアクションの 3 要素

#### タブ（`.tab-group` / `.tab-btn`）
- グループ背景: `--bg-primary`
- 非アクティブ: 透明背景、`--text-secondary`
- アクティブ（`.active`）: `--accent` 背景、白テキスト

#### ボタンバリアント

| クラス | スタイル |
|--------|---------|
| `.btn-primary` | `--accent` 背景、白テキスト、ホバーで上方向 translateY |
| `.btn-secondary` | `--bg-tertiary` 背景、ボーダー付き |
| `.btn-danger` | `--danger-dim` 背景、ホバーで `--danger` 背景に変化 |
| `.btn-ghost` | 透明背景、ホバーで `--bg-tertiary` |
| `.btn-sm` | padding 縮小、font-size 12px |
| `.btn-icon` | 正方形（32×32px） |

#### フォームコントロール
- 入力系（`input`、`select`、`textarea`）: 統一スタイル、フォーカス時 `--accent` ボーダー
- `input[type=range]`: ボーダーなし、透明背景

#### バッジ類

| クラス | 用途 |
|--------|------|
| `.priority-high/medium/low` | 優先度バッジ（丸角、半透明背景） |
| `.status-todo/in_progress/done` | ステータスバッジ |
| `.category-badge` | カテゴリバッジ |
| `.schedule-badge-overdue/due-soon` | スケジュールバッジ |
| `.milestone-badge` | マイルストーンバッジ |
| `.milestone-overdue` | 超過マイルストーン（`milestonePulse` アニメーション） |

#### ガントチャート

| クラス | 説明 |
|--------|------|
| `.gantt-container` | flexbox コンテナ |
| `.gantt-sidebar` | リサイズ可能左パネル |
| `.gantt-resize-handle` | ドラッグ用ハンドル（`col-resize` カーソル） |
| `.gantt-chart-area` | 横スクロール可能なチャートエリア |
| `.gantt-header-months` / `.gantt-header-days` | 月・日ヘッダー行 |
| `.gantt-day-cell.weekend` | 休日の背景色（`--gantt-weekend`） |
| `.gantt-day-cell.today` | 今日の強調表示 |
| `.gantt-bar-wrapper` | タスクバーの位置決め（絶対配置） |
| `.gantt-bar-schedule` | スケジュールバー（上段） |
| `.gantt-bar-actual` | 進捗バー（下段） |
| `.gantt-bar-overdue` | 遅延時（`overduePulse` アニメーション） |
| `.gantt-bar-shifted` | 日程ずらし済み（破線ボーダー） |
| `.today-line` | 今日ライン（`--today-line` 色の縦線） |
| `.gantt-milestone-marker` | マイルストーン 🚩 マーカー |
| `.progress-popover` | 進捗編集ポップオーバー |

### 8.3 アニメーション

| アニメーション | 適用先 | 動作 |
|----------------|--------|------|
| `fadeIn` | モーダルオーバーレイ等 | opacity 0 → 1（0.15s） |
| `slideUp` | モーダル、ポップオーバー | opacity + translateY(20px) → 0（0.2s / 0.1s） |
| `overduePulse` | 遅延タスクバー | opacity 1 → 0.5 の繰り返し（2s、ease-in-out） |
| `milestonePulse` | 超過マイルストーン | opacity 1 → 0.4 の繰り返し（2s、ease-in-out） |

### 8.4 スクロールバー

カスタムスタイル（WebKit）:
- 幅・高さ: 6px
- トラック: transparent
- サム: `--border` 色、丸角 3px、ホバーで `--text-muted`

---

## 9. データフロー図

### 9.1 初期データフロー

```
[ページロード完了]
       |
       v
App: useEffect（初回のみ）
  ├─ fetchTasks()       → GET /api/tasks       → setTasks(data)
  ├─ fetchUsers()       → GET /api/users       → setUsers(data)
  └─ fetchCategories()  → GET /api/categories  → setCategories(data)
       |
       v
useMemo: enrichedTasks = enrichTasks(tasks, holidayMode)
  └─ shiftOverlappingTasks() で shifted_start_date を計算
  └─ calcEndDate() で end_date を計算
       |
       v
useMemo: filteredTasks = enrichedTasks.filter(...)
  └─ filterAssignees / filterStatuses / filterCategories / searchQuery を適用
       |
       v
TaskListView / GanttChart へ filteredTasks を渡す
```

### 9.2 タスク作成フロー

```
ユーザー: 「＋新規タスク」ボタンクリック
       |
       v
App: setShowTaskForm(true), setEditingTask(null), setSubtaskParent(null)
       |
       v
TaskFormModal 表示（新規作成モード）
  └─ ユーザーがフォームを入力
  └─ 「作成」クリック → handleSubmit() → onSave(formData)
       |
       v
App: handleSaveTask(formData)
  └─ POST /api/tasks → savedTask
  └─ TaskFlow.emit('task:created', { task: savedTask })
  └─ setShowTaskForm(false)
  └─ fetchTasks()       → setTasks(newData)
  └─ fetchCategories()  → setCategories(newData)
```

### 9.3 ガント進捗更新フロー

```
ユーザー: ガントチャートのタスクバークリック
       |
       v
GanttChart: handleBarClick() → setPopover({ task, x, y, progress })
       |
       v
進捗ポップオーバー表示
  └─ range input でリアルタイムプレビュー
  └─ 「保存」クリック → handleProgressSave() → onUpdateProgress(taskId, progress)
       |
       v
App: handleUpdateProgress(taskId, progress)
  └─ PUT /api/tasks/:id { progress, status }
  └─ タスクがサブタスクの場合:
       └─ 兄弟サブタスクの平均進捗を計算
       └─ PUT /api/tasks/:parentId { progress: avg, status }
  └─ fetchTasks() → setTasks(newData)
```

### 9.4 フィルタリングフロー

```
ユーザー: FilterBar で条件変更
  ├─ MultiSelectDropdown（担当者）  → setFilterAssignees([...])
  ├─ MultiSelectDropdown（ステータス）→ setFilterStatuses([...])
  ├─ MultiSelectDropdown（カテゴリ） → setFilterCategories([...])
  ├─ SearchInput                   → setSearchQuery('...')
  └─ select（休日モード）           → handleHolidayModeChange(mode)
                                       → setHolidayMode / localStorage.setItem
       |
       v
useMemo: filteredTasks が自動再計算（サーバー通信なし）
       |
       v
TaskListView / GanttChart が即時再レンダリング
```

### 9.5 拡張イベントフロー

```
App: handleSaveTask / handleDeleteTask
       |
       v
TaskFlow.emit('task:created' | 'task:updated' | 'task:deleted', data)
       |
       v
_hooks[event] 配列の各 fn を順次呼び出し（try-catch で安全に実行）
       |
       v
拡張側のフック処理（例: ラベル情報の更新、外部同期など）
```
