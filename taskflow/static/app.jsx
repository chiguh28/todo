const { useState, useEffect, useRef, useCallback, useMemo, createPortal } = React;

// ============ 複数選択ドロップダウン ============
function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const displayLabel = selected.length === 0 ? label : `${label} (${selected.length})`;

  return (
    <div className="multi-select-dropdown" ref={ref}>
      <button className={`multi-select-btn ${selected.length > 0 ? 'has-selection' : ''}`}
              onClick={() => setOpen(v => !v)}>
        {displayLabel} <span className="multi-select-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="multi-select-menu">
          {options.map(opt => (
            <label key={opt.value} className="multi-select-option">
              <input type="checkbox" checked={selected.includes(opt.value)}
                     onChange={() => toggle(opt.value)} />
              <span>{opt.label}</span>
            </label>
          ))}
          {options.length === 0 && <div className="multi-select-empty">選択肢なし</div>}
        </div>
      )}
    </div>
  );
}

// ============ 拡張機能レジストリ ============
window.TaskFlow = (() => {
  const _extensions = [];
  const _tabs        = [];   // { id, label, icon, component }
  const _formFields  = [];   // { component } — TaskFormModal の追加フィールド
  const _columns     = [];   // { header, width, render } — TaskListView の追加列
  const _headerActions = []; // { component } — ヘッダーの追加ボタン
  const _hooks       = {};   // { 'task:created': [fn, ...], ... }

  return {
    // 拡張が呼ぶ登録 API
    registerExtension(cfg) {
      _extensions.push(cfg);
      if (cfg.tabs)          _tabs.push(...cfg.tabs);
      if (cfg.formFields)    _formFields.push(...cfg.formFields);
      if (cfg.columns)       _columns.push(...cfg.columns);
      if (cfg.headerActions) _headerActions.push(...cfg.headerActions);
      if (cfg.hooks) {
        for (const [ev, fn] of Object.entries(cfg.hooks)) {
          (_hooks[ev] = _hooks[ev] || []).push(fn);
        }
      }
    },
    // コアが使うイベント発火
    emit(event, data) {
      (_hooks[event] || []).forEach(fn => {
        try { fn(data); } catch(e) { console.error(`[TaskFlow] hook error (${event}):`, e); }
      });
    },
    // 読み取り専用ビュー (コンポーネントから参照)
    get tabs()          { return _tabs; },
    get formFields()    { return _formFields; },
    get columns()       { return _columns; },
    get headerActions() { return _headerActions; },
    // 全拡張ロード後に index.html のブートスクリプトが呼ぶ
    _boot: null,
    // 拡張から使えるユーティリティ (api は下で注入)
    api: null,
  };
})();

// ============ API Helpers ============
const api = {
  async get(url) { const r = await fetch(url); return r.json(); },
  async post(url, data) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    return r.json();
  },
  async del(url) { const r = await fetch(url, { method:'DELETE' }); return r.json(); },
};
TaskFlow.api = api;

// ============ Utilities ============
const formatDate = (d) => d ? new Date(d).toLocaleDateString('ja-JP', { month:'short', day:'numeric' }) : '';
const toDateStr = (d) => {
  if (!(d instanceof Date)) return d;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' };
const STATUS_LABELS = { todo: '未着手', in_progress: '進行中', done: '完了' };
const USER_COLORS = ['#4A90D9','#E8913A','#50B83C','#A78BFA','#FF6B8A','#00C9A7','#FFD93D'];
const HOURS_PER_DAY = 8;

// ---- 祝日計算 ----
const getJapaneseHolidays = (year) => {
  const holidays = new Set();
  const add = (m, d) => holidays.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  const nthMonday = (month, n) => {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow <= 1 ? 1 + (1 - dow) : 1 + (8 - dow);
    return firstMon + (n - 1) * 7;
  };
  add(1, 1); add(1, nthMonday(1, 2)); add(2, 11); add(2, 23);
  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(3, shunbun);
  add(4, 29); add(5, 3); add(5, 4); add(5, 5);
  add(7, nthMonday(7, 3)); add(8, 11); add(9, nthMonday(9, 3));
  const shuubun = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(9, shuubun);
  add(10, nthMonday(10, 2)); add(11, 3); add(11, 23);
  // 振替休日
  for (const ds of [...holidays].sort()) {
    const dt = new Date(ds + 'T00:00:00');
    if (dt.getDay() === 0) {
      let sub = new Date(dt);
      sub.setDate(sub.getDate() + 1);
      while (holidays.has(toDateStr(sub))) sub.setDate(sub.getDate() + 1);
      holidays.add(toDateStr(sub));
    }
  }
  return holidays;
};
const _holidayCache = {};
const isJapaneseHoliday = (ds) => {
  const y = parseInt(ds.slice(0, 4));
  if (!_holidayCache[y]) _holidayCache[y] = getJapaneseHolidays(y);
  return _holidayCache[y].has(ds);
};
const isHoliday = (ds, mode) => {
  const dow = new Date(ds + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) return true;
  if (mode === 'weekends_holidays' && isJapaneseHoliday(ds)) return true;
  return false;
};

// 工数 → 終了日計算
const calcEndDate = (startDate, estimatedHours, holidayMode) => {
  if (!startDate || !estimatedHours || estimatedHours <= 0) return startDate;
  let remaining = Math.ceil(estimatedHours / HOURS_PER_DAY);
  const d = new Date(startDate + 'T00:00:00');
  while (isHoliday(toDateStr(d), holidayMode)) d.setDate(d.getDate() + 1);
  remaining--;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isHoliday(toDateStr(d), holidayMode)) remaining--;
  }
  return toDateStr(d);
};

// 担当者ごとに1日8hを超える場合、優先度の高いタスクを優先し低いタスクの期間を延長する
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const shiftOverlappingTasks = (tasks, holidayMode) => {
  const result = tasks.map(t => ({ ...t }));
  // 担当者ごとにグルーピング
  const byAssignee = {};
  const unassigned = [];
  result.forEach((t, idx) => {
    if (t.assignee_id) {
      (byAssignee[t.assignee_id] = byAssignee[t.assignee_id] || []).push(idx);
    } else {
      unassigned.push(idx);
    }
  });

  for (const indices of Object.values(byAssignee)) {
    const assigneeTasks = indices
      .filter(idx => result[idx].start_date && result[idx].estimated_hours > 0 && result[idx].status !== 'done');

    if (assigneeTasks.length === 0) continue;

    // 優先度順 → 開始日順 → sort_order → id でソート（高優先度が先に時間を確保）
    assigneeTasks.sort((a, b) => {
      const pa = PRIORITY_ORDER[result[a].priority] ?? 1;
      const pb = PRIORITY_ORDER[result[b].priority] ?? 1;
      if (pa !== pb) return pa - pb;
      const cmp = (result[a].start_date || '').localeCompare(result[b].start_date || '');
      if (cmp !== 0) return cmp;
      if (result[a].sort_order !== result[b].sort_order) return result[a].sort_order - result[b].sort_order;
      return result[a].id - result[b].id;
    });

    // 各タスクの残り時間を管理
    const remaining = {};
    const soloEndDate = {};
    assigneeTasks.forEach(idx => {
      remaining[idx] = result[idx].estimated_hours;
      result[idx].shifted_start_date = result[idx].start_date;
      soloEndDate[idx] = calcEndDate(result[idx].start_date, result[idx].estimated_hours, holidayMode);
    });

    // 最も早い開始日からシミュレーション
    const earliestStart = assigneeTasks.reduce((min, idx) =>
      !min || result[idx].start_date < min ? result[idx].start_date : min, null);

    const d = new Date(earliestStart + 'T00:00:00');
    const maxDays = 365;
    let daysProcessed = 0;

    while (daysProcessed < maxDays) {
      const ds = toDateStr(d);

      if (isHoliday(ds, holidayMode)) {
        d.setDate(d.getDate() + 1);
        daysProcessed++;
        continue;
      }

      let availableHours = HOURS_PER_DAY;

      // 優先度順に時間を割り当て
      for (const idx of assigneeTasks) {
        if (remaining[idx] <= 0) continue;
        if (result[idx].start_date > ds) continue; // まだ開始していない
        if (availableHours <= 0) continue; // この日は空きなし（ただし他のタスクも確認）

        const allocate = Math.min(remaining[idx], availableHours);
        remaining[idx] -= allocate;
        availableHours -= allocate;

        // この日に割り当てがあれば終了日を更新
        result[idx].end_date = ds;
      }

      // 全タスク完了チェック
      if (assigneeTasks.every(idx => remaining[idx] <= 0)) break;

      d.setDate(d.getDate() + 1);
      daysProcessed++;
    }

    // 期間延長されたタスクにフラグを立てる
    assigneeTasks.forEach(idx => {
      result[idx]._isExtended = result[idx].end_date > soloEndDate[idx];
    });
  }

  // 未割当タスク・完了タスクは通常通り（競合計算に含めない）
  result.forEach(t => {
    if (!t.end_date) {
      t.end_date = calcEndDate(t.start_date, t.estimated_hours, holidayMode);
      t.shifted_start_date = t.start_date;
    }
  });

  return result;
};

const enrichTasks = (tasks, holidayMode) => {
  const shifted = shiftOverlappingTasks(tasks, holidayMode);
  return shifted.map(t => ({
    ...t,
    end_date: t.end_date || calcEndDate(t.shifted_start_date || t.start_date, t.estimated_hours, holidayMode),
  }));
};

const getScheduleStatus = (task) => {
  if (task.status === 'done') return 'done';
  const today = toDateStr(new Date());
  if (task.end_date < today) return 'overdue';
  if (daysBetween(today, task.end_date) <= 2) return 'due-soon';
  return 'on-track';
};
const SCHEDULE_BADGES = { overdue: '遅延', 'due-soon': '期限近' };

const getProgressColor = (task) => {
  if (task.progress >= 100 || task.status === 'done') return 'var(--success)';
  const s = getScheduleStatus(task);
  if (s === 'overdue') return 'var(--danger)';
  if (s === 'due-soon' && task.progress < 80) return 'var(--warning)';
  if (task.progress >= 50) return 'var(--accent)';
  return 'var(--warning)';
};

// ============ TaskFormModal ============
function TaskFormModal({ task, users, holidayMode, categories, onSave, onClose }) {
  const isEdit = !!task?.id;
  const isSubtask = !!task?.parent_id && !isEdit;
  const today = toDateStr(new Date());
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignee_id: task?.assignee_id || '',
    start_date: task?.start_date || today,
    estimated_hours: task?.estimated_hours || 8,
    progress: task?.progress || 0,
    priority: task?.priority || 'medium',
    status: task?.status || 'todo',
    milestone: task?.milestone || '',
    category: task?.category || '',
  });
  const [newCategory, setNewCategory] = useState('');

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const previewEndDate = useMemo(
    () => calcEndDate(form.start_date, form.estimated_hours, holidayMode),
    [form.start_date, form.estimated_hours, holidayMode]
  );
  const previewDays = useMemo(() => Math.ceil(form.estimated_hours / HOURS_PER_DAY), [form.estimated_hours]);

  const handleSubmit = () => {
    if (!form.title.trim()) return alert('タイトルを入力してください');
    if (!form.start_date) return alert('開始日を入力してください');
    if (!form.estimated_hours || form.estimated_hours <= 0) return alert('工数を入力してください');
    onSave({ ...form, assignee_id: form.assignee_id || null, milestone: form.milestone || null });
  };

  const handleCategoryChange = (value) => {
    if (value === '__new__') {
      setNewCategory('');
      set('category', '');
    } else {
      set('category', value);
      setNewCategory('');
    }
  };

  const showNewCategoryInput = form.category === '' && newCategory !== null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'タスク編集' : isSubtask ? '新規サブタスク' : '新規タスク'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>タイトル *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
                 placeholder="タスク名を入力" autoFocus />
        </div>
        <div className="form-group">
          <label>説明</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
                    placeholder="タスクの詳細説明（任意）" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>担当者</label>
            <select value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
              <option value="">未割当</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>優先度</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div className="form-group">
            <label>ステータス</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="todo">未着手</option>
              <option value="in_progress">進行中</option>
              <option value="done">完了</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>カテゴリ</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={categories.includes(form.category) ? form.category : (form.category ? '__new__' : '')}
                    onChange={e => handleCategoryChange(e.target.value)}
                    style={{ flex: 1 }}>
              <option value="">なし</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">＋ 新規カテゴリ...</option>
            </select>
            {(form.category === '' && newCategory === '') ? null : null}
          </div>
          {(!categories.includes(form.category) && (form.category !== '' || newCategory !== null)) && (
            <input style={{ marginTop: 6 }} value={form.category}
                   onChange={e => set('category', e.target.value)}
                   placeholder="新しいカテゴリ名を入力" />
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>開始日 *</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>工数（時間） *</label>
            <input type="number" min="1" step="1" value={form.estimated_hours}
                   onChange={e => set('estimated_hours', Math.max(1, parseFloat(e.target.value) || 1))} />
          </div>
        </div>
        <div className="form-hint">
          {previewDays}営業日（{formatDate(form.start_date)}〜{formatDate(previewEndDate)}）
          ※1日={HOURS_PER_DAY}時間
        </div>
        <div className="form-group">
          <label>マイルストーン</label>
          <input type="date" value={form.milestone} onChange={e => set('milestone', e.target.value)} />
          {form.milestone && (
            <div className="form-hint" style={{ marginTop: 4 }}>
              🚩 {formatDate(form.milestone)}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, padding: '0 6px' }}
                      onClick={() => set('milestone', '')}>クリア</button>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>進捗率: {form.progress}%</label>
          <input type="range" min="0" max="100" step="5"
                 value={form.progress} onChange={e => set('progress', parseInt(e.target.value))} />
        </div>

        {/* 拡張フォームフィールド */}
        {TaskFlow.formFields.map((field, i) => {
          const Field = field.component;
          return <Field key={i} form={form} setForm={setForm} task={task} users={users} />;
        })}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={handleSubmit}>{isEdit ? '更新' : '作成'}</button>
        </div>
      </div>
    </div>
  );
}

// ============ UserManagerModal ============
function UserManagerModal({ users, onClose, onRefresh }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(USER_COLORS[users.length % USER_COLORS.length]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    await api.post('/api/users', { name: name.trim(), color });
    setName('');
    setColor(USER_COLORS[(users.length + 1) % USER_COLORS.length]);
    onRefresh();
  };

  const handleDelete = async (id, uname) => {
    if (!confirm(`${uname} を削除しますか？`)) return;
    await api.del(`/api/users/${id}`);
    onRefresh();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 400 }}>
        <div className="modal-header">
          <div className="modal-title">メンバー管理</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          {users.map(u => (
            <div key={u.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                      padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <span className="assignee-dot" style={{ background: u.color }} />
                {u.name}
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id, u.name)}>削除</button>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="新しいメンバー名"
                 onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
                 style={{ width: 40, padding: 2, cursor: 'pointer' }} />
          <button className="btn btn-primary" onClick={handleAdd}>追加</button>
        </div>
      </div>
    </div>
  );
}

// ============ TaskListView ============
function TaskListView({ tasks, users, onEdit, onDelete, onAddSubtask }) {
  // 親タスクだけカウント
  const parentTasks = tasks.filter(t => !t.parent_id);
  const totalTasks = parentTasks.length;
  const doneTasks = parentTasks.filter(t => t.status === 'done').length;
  const avgProgress = totalTasks ? Math.round(parentTasks.reduce((s, t) => s + t.progress, 0) / totalTasks) : 0;

  // 親子構造を構築
  const buildTree = (taskList) => {
    const parents = taskList.filter(t => !t.parent_id);
    const childMap = {};
    taskList.filter(t => t.parent_id).forEach(t => {
      (childMap[t.parent_id] = childMap[t.parent_id] || []).push(t);
    });
    const result = [];
    parents.forEach(p => {
      result.push(p);
      if (childMap[p.id]) {
        childMap[p.id].forEach(c => result.push({ ...c, _isSubtask: true }));
      }
    });
    return result;
  };

  const treeList = useMemo(() => buildTree(tasks), [tasks]);

  if (totalTasks === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-text">まだタスクがありません<br/>「+新規タスク」から最初のタスクを作成しましょう</div>
      </div>
    );
  }

  let rowNum = 0;

  return (
    <div>
      <div className="task-list-header">
        <div className="task-stats">
          <span>全タスク: <span className="task-stat-value">{totalTasks}</span></span>
          <span>完了: <span className="task-stat-value">{doneTasks}</span></span>
          <span>平均進捗: <span className="task-stat-value">{avgProgress}%</span></span>
        </div>
      </div>
      <table className="task-table">
        <thead>
          <tr>
            <th style={{width:30}}></th>
            <th>タスク名</th>
            <th style={{width:80}}>カテゴリ</th>
            <th style={{width:80}}>担当</th>
            <th style={{width:60}}>優先度</th>
            <th style={{width:70}}>ステータス</th>
            <th style={{width:130}}>期間</th>
            <th style={{width:130}}>進捗</th>
            <th style={{width:100}}>マイルストーン</th>
            {/* 拡張列ヘッダー */}
            {TaskFlow.columns.map((col, i) => (
              <th key={`ext-h-${i}`} style={{width: col.width || 80}}>{col.header}</th>
            ))}
            <th style={{width:100}}></th>
          </tr>
        </thead>
        <tbody>
          {treeList.map((t) => {
            if (!t._isSubtask) rowNum++;
            return (
              <tr key={t.id} className={t._isSubtask ? 'subtask-row' : ''}>
                <td style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                  {t._isSubtask ? '' : rowNum}
                </td>
                <td className="task-title-cell" onClick={() => onEdit(t)}
                    style={t._isSubtask ? { paddingLeft: 32 } : {}}>
                  {t._isSubtask && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>└</span>}
                  {t.title}
                </td>
                <td>
                  {t.category ? (
                    <span className="category-badge">{t.category}</span>
                  ) : <span style={{ color:'var(--text-muted)' }}>—</span>}
                </td>
                <td>
                  {t.assignee_name ? (
                    <span className="assignee-chip">
                      <span className="assignee-dot" style={{ background: t.assignee_color }} />
                      {t.assignee_name}
                    </span>
                  ) : <span style={{ color:'var(--text-muted)' }}>—</span>}
                </td>
                <td><span className={`priority-badge priority-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span></td>
                <td><span className={`status-badge status-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                <td>
                  {(() => {
                    const s = getScheduleStatus(t);
                    const displayStart = t.start_date;
                    const isExtended = t._isExtended;
                    return (
                      <div className={`schedule-cell schedule-${s}`}>
                        {isExtended && <span className="schedule-badge" style={{ background:'var(--warning-dim)', color:'var(--warning)' }} title="他タスクと競合し期間延長">⏳延長</span>}
                        <span className="schedule-date">{formatDate(displayStart)}〜{formatDate(t.end_date)}</span>
                        <span className="schedule-hours">{t.estimated_hours}h</span>
                        {SCHEDULE_BADGES[s] && (
                          <span className={`schedule-badge schedule-badge-${s}`}>{SCHEDULE_BADGES[s]}</span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <span className="progress-bar-mini">
                    <div className="progress-bar-mini-fill"
                         style={{ width: `${t.progress}%`, background: getProgressColor(t) }} />
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: getProgressColor(t) }}>{t.progress}%</span>
                </td>
                <td>
                  {t.milestone ? (
                    <span className={`milestone-badge ${t.end_date > t.milestone ? 'milestone-overdue' : ''}`}>
                      🚩 {formatDate(t.milestone)}
                    </span>
                  ) : <span style={{ color:'var(--text-muted)' }}>—</span>}
                </td>
                {/* 拡張列セル */}
                {TaskFlow.columns.map((col, ci) => (
                  <td key={`ext-c-${ci}`}>{col.render(t)}</td>
                ))}
                <td>
                  <div className="action-btns">
                    {!t._isSubtask && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onAddSubtask(t)} title="サブタスク追加">＋</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)} title="編集">✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onDelete(t.id)} title="削除">🗑️</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============ GanttChart ============
function GanttChart({ tasks, users, holidayMode, onUpdateProgress, onEdit }) {
  const chartRef = useRef(null);
  const sidebarBodyRef = useRef(null);
  const [popover, setPopover] = useState(null);
  const [sortByDate, setSortByDate] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ganttSidebarWidth');
    return saved ? parseInt(saved, 10) : 280;
  });
  const isDragging = useRef(false);
  const DAY_WIDTH = 36;

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev) => {
      const newWidth = Math.max(150, Math.min(600, startWidth + ev.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setSidebarWidth(w => { localStorage.setItem('ganttSidebarWidth', w); return w; });
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  // 親子構造 + カテゴリグループ対応
  const sortedTasks = useMemo(() => {
    // 親タスクとサブタスクを分離
    const parents = tasks.filter(t => !t.parent_id);
    const childMap = {};
    tasks.filter(t => t.parent_id).forEach(t => {
      (childMap[t.parent_id] = childMap[t.parent_id] || []).push(t);
    });

    let orderedParents = [...parents];
    if (sortByDate) {
      orderedParents.sort((a, b) => a.start_date.localeCompare(b.start_date));
    }

    if (groupByCategory) {
      // カテゴリごとにグループ化
      const catMap = {};
      const noCategory = [];
      orderedParents.forEach(t => {
        const cat = t.category || '';
        if (cat) {
          (catMap[cat] = catMap[cat] || []).push(t);
        } else {
          noCategory.push(t);
        }
      });
      const catNames = Object.keys(catMap).sort();
      const result = [];
      catNames.forEach(cat => {
        result.push({ _isCategoryHeader: true, _categoryName: cat, id: `cat-${cat}` });
        catMap[cat].forEach(p => {
          result.push(p);
          if (childMap[p.id]) {
            childMap[p.id].forEach(c => result.push({ ...c, _isSubtask: true }));
          }
        });
      });
      if (noCategory.length > 0) {
        result.push({ _isCategoryHeader: true, _categoryName: '未分類', id: 'cat-none' });
        noCategory.forEach(p => {
          result.push(p);
          if (childMap[p.id]) {
            childMap[p.id].forEach(c => result.push({ ...c, _isSubtask: true }));
          }
        });
      }
      return result;
    }

    // フラットに親→子の順で並べる
    const result = [];
    orderedParents.forEach(p => {
      result.push(p);
      if (childMap[p.id]) {
        childMap[p.id].forEach(c => result.push({ ...c, _isSubtask: true }));
      }
    });
    return result;
  }, [tasks, sortByDate, groupByCategory]);

  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const today = new Date();
      const start = new Date(today); start.setDate(start.getDate() - 7);
      const end = new Date(today);   end.setDate(end.getDate() + 30);
      return { start, end };
    }
    const dates = tasks.flatMap(t => [
      new Date(t.start_date),
      new Date(t.end_date),
      ...(t.milestone ? [new Date(t.milestone)] : []),
    ]);
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    min.setDate(min.getDate() - 5);
    max.setDate(max.getDate() + 10);
    return { start: min, end: max };
  }, [tasks]);

  const days = useMemo(() => {
    const result = [];
    const d = new Date(dateRange.start);
    while (d <= dateRange.end) { result.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return result;
  }, [dateRange]);

  const months = useMemo(() => {
    const m = []; let current = null;
    days.forEach((d, i) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== current) { current = key; m.push({ year: d.getFullYear(), month: d.getMonth(), count: 0 }); }
      m[m.length - 1].count++;
    });
    return m;
  }, [days]);

  const todayStr = toDateStr(new Date());
  const todayIndex = days.findIndex(d => toDateStr(d) === todayStr);
  const totalWidth = days.length * DAY_WIDTH;

  const handleChartScroll = useCallback((e) => {
    if (sidebarBodyRef.current) sidebarBodyRef.current.scrollTop = e.target.scrollTop;
  }, []);

  useEffect(() => {
    if (chartRef.current && todayIndex >= 0)
      chartRef.current.scrollLeft = Math.max(0, todayIndex * DAY_WIDTH - 300);
  }, [todayIndex]);

  const handleBarClick = (e, task) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ task, x: rect.left + rect.width / 2, y: rect.bottom + 8, progress: task.progress });
  };

  const handleProgressSave = () => {
    if (popover) { onUpdateProgress(popover.task.id, popover.progress); setPopover(null); }
  };

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="empty-state-text">タスクを登録するとガントチャートが自動生成されます</div>
      </div>
    );
  }

  return (
    <div className="gantt-container">
      <div className="gantt-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <div className="gantt-sidebar-header">
          <span>タスク一覧</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`btn btn-ghost btn-sm gantt-sort-btn ${groupByCategory ? 'active' : ''}`}
                    onClick={() => setGroupByCategory(v => !v)} title="カテゴリ別に表示">
              🏷️ カテゴリ別
            </button>
            <button className={`btn btn-ghost btn-sm gantt-sort-btn ${sortByDate ? 'active' : ''}`}
                    onClick={() => setSortByDate(v => !v)} title="開始日順にソート">
              📅 開始日順
            </button>
          </div>
        </div>
        <div className="gantt-sidebar-body" ref={sidebarBodyRef}>
          {sortedTasks.map(t => {
            if (t._isCategoryHeader) {
              return (
                <div key={t.id} className="gantt-sidebar-row gantt-category-header">
                  <span className="category-badge">{t._categoryName}</span>
                </div>
              );
            }
            return (
              <div key={t.id} className={`gantt-sidebar-row ${t._isSubtask ? 'gantt-subtask-row' : ''}`}
                   onClick={() => onEdit(t)}>
                {t._isSubtask && <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>└</span>}
                <span className="assignee-dot" style={{ background: t.assignee_color || '#666', flexShrink:0 }} />
                <span className="gantt-sidebar-title">
                  {t._isExtended && <span title="他タスクと競合し期間延長" style={{ color:'var(--warning)', marginRight:2 }}>⏳</span>}
                  {t.title}
                </span>
                {t.milestone && <span style={{ fontSize:10, flexShrink:0 }} title={`MS: ${formatDate(t.milestone)}`}>🚩</span>}
                <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text-muted)', flexShrink:0 }}>{t.estimated_hours}h</span>
                <span style={{ fontSize:11, fontFamily:'var(--mono)', color: getProgressColor(t), flexShrink:0 }}>{t.progress}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="gantt-resize-handle" onMouseDown={handleResizeStart} />
      <div className="gantt-chart-area" ref={chartRef} onScroll={handleChartScroll}>
        <div className="gantt-header" style={{ width: totalWidth }}>
          <div className="gantt-header-months">
            {months.map((m, i) => (
              <div key={i} className="gantt-month-cell" style={{ width: m.count * DAY_WIDTH }}>
                {m.year}年 {m.month + 1}月
              </div>
            ))}
          </div>
          <div className="gantt-header-days">
            {days.map((d, i) => {
              const ds = toDateStr(d);
              return (
                <div key={i}
                     className={`gantt-day-cell ${isHoliday(ds, holidayMode) ? 'weekend' : ''} ${ds === todayStr ? 'today' : ''}`}
                     style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}>
                  {d.getDate()}
                </div>
              );
            })}
          </div>
        </div>

        <div className="gantt-body" style={{ width: totalWidth, position: 'relative' }}>
          {sortedTasks.map(t => (
            <div key={t.id} className={`gantt-row ${t._isCategoryHeader ? 'gantt-row-category' : ''} ${t._isSubtask ? 'gantt-row-subtask' : ''}`}>
              {t._isCategoryHeader ? (
                <div className="gantt-category-row-label" style={{ width: totalWidth }} />
              ) : days.map((d, i) => (
                <div key={i}
                     className={`gantt-cell ${isHoliday(toDateStr(d), holidayMode) ? 'weekend' : ''}`}
                     style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }} />
              ))}
            </div>
          ))}

          {sortedTasks.map((t, rowIndex) => {
            if (t._isCategoryHeader) return null;
            const displayStart = t.start_date;
            if (!displayStart || !t.end_date) return null;
            const startDay = daysBetween(toDateStr(dateRange.start), displayStart);
            const duration = daysBetween(displayStart, t.end_date) + 1;
            const left = startDay * DAY_WIDTH;
            const width = duration * DAY_WIDTH;
            const barColor = t.assignee_color || '#666';
            const isOverdue = getScheduleStatus(t) === 'overdue';
            const isExtended = t._isExtended;
            const isSubtask = t._isSubtask;
            // マイルストーン位置
            const milestoneDay = t.milestone ? daysBetween(toDateStr(dateRange.start), t.milestone) : null;
            const milestoneOverdue = t.milestone && t.end_date > t.milestone;
            return (
              <React.Fragment key={t.id}>
                <div className={`gantt-bar-wrapper ${isExtended ? 'gantt-bar-extended' : ''} ${isSubtask ? 'gantt-bar-subtask' : ''}`}
                     style={{ top: rowIndex * 40, left, width }}
                     onClick={(e) => handleBarClick(e, t)}
                     title={isExtended ? `他タスクと競合し期間延長` : ''}>
                  <div className={`gantt-bar-schedule ${isOverdue ? 'gantt-bar-overdue' : ''}`}
                       style={{
                         background: barColor + (isSubtask ? '10' : '20'),
                         border: isOverdue ? '2px solid var(--danger)' : `${isSubtask ? '1' : '2'}px solid ${barColor}`,
                         height: isSubtask ? 14 : 18,
                       }}>
                    <div className="gantt-bar-label" style={isSubtask ? { fontSize: 9, lineHeight: '14px' } : {}}>
                      {isExtended && <span className="gantt-shift-icon" title="期間延長">⏳ </span>}
                      {width > 80 ? t.title : ''}
                    </div>
                  </div>
                  <div className="gantt-bar-actual"
                       style={{ width: `${t.progress}%`, background: getProgressColor(t), height: isSubtask ? 4 : 6 }} />
                </div>
                {milestoneDay !== null && (
                  <div className={`gantt-milestone-marker ${milestoneOverdue ? 'gantt-milestone-overdue' : ''}`}
                       style={{ top: rowIndex * 40, left: milestoneDay * DAY_WIDTH + DAY_WIDTH / 2 - 6 }}
                       title={`マイルストーン: ${formatDate(t.milestone)}${milestoneOverdue ? '（超過）' : ''}`}>
                    🚩
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {todayIndex >= 0 && (
            <div className="today-line"
                 style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2, height: sortedTasks.length * 40 }} />
          )}
        </div>
      </div>

      {popover && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={() => setPopover(null)} />
          <div className="progress-popover" style={{ left: popover.x - 100, top: popover.y }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{popover.task.title}</div>
            <div className="progress-popover-value">{popover.progress}%</div>
            <input type="range" min="0" max="100" step="5"
                   value={popover.progress}
                   onChange={e => setPopover(prev => ({ ...prev, progress: parseInt(e.target.value) }))} />
            <div style={{ display:'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPopover(null)}>閉じる</button>
              <button className="btn btn-primary btn-sm" onClick={handleProgressSave}>保存</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============ Main App ============
function App() {
  const [view, setView] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showUserManager, setShowUserManager] = useState(false);
  const [filterAssignees, setFilterAssignees] = useState([]);
  const [filterStatuses, setFilterStatuses] = useState([]);
  const [filterCategories, setFilterCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [holidayMode, setHolidayMode] = useState(() => localStorage.getItem('holidayMode') || 'weekends');
  const [subtaskParent, setSubtaskParent] = useState(null);

  const handleHolidayModeChange = (mode) => {
    setHolidayMode(mode);
    localStorage.setItem('holidayMode', mode);
  };

  const fetchTasks = async () => { setTasks(await api.get('/api/tasks')); };
  const fetchUsers = async () => { setUsers(await api.get('/api/users')); };
  const fetchCategories = async () => { setCategories(await api.get('/api/categories')); };

  useEffect(() => { fetchTasks(); fetchUsers(); fetchCategories(); }, []);

  const enrichedTasks = useMemo(() => enrichTasks(tasks, holidayMode), [tasks, holidayMode]);
  const filteredTasks = useMemo(() => enrichedTasks.filter(t => {
    if (filterAssignees.length > 0 && !filterAssignees.includes(String(t.assignee_id))) return false;
    if (filterStatuses.length > 0 && !filterStatuses.includes(t.status)) return false;
    if (filterCategories.length > 0) {
      // カテゴリフィルタ: 親タスクのカテゴリで絞り込む（サブタスクも親のカテゴリに連動）
      if (t.parent_id) {
        const parent = enrichedTasks.find(p => p.id === t.parent_id);
        if (!parent || !filterCategories.includes(parent.category)) return false;
      } else if (!filterCategories.includes(t.category)) return false;
    }
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [enrichedTasks, filterAssignees, filterStatuses, filterCategories, searchQuery]);

  // サブタスクの進捗から親タスクの進捗を自動計算して更新
  const updateParentProgress = async (parentId) => {
    const subtasks = tasks.filter(t => t.parent_id === parentId);
    if (subtasks.length === 0) return;
    const avgProgress = Math.round(subtasks.reduce((s, t) => s + t.progress, 0) / subtasks.length);
    const status = avgProgress >= 100 ? 'done' : avgProgress > 0 ? 'in_progress' : 'todo';
    await api.put(`/api/tasks/${parentId}`, { progress: avgProgress, status });
  };

  const handleSaveTask = async (formData) => {
    let savedTask;
    if (editingTask?.id) {
      savedTask = await api.put(`/api/tasks/${editingTask.id}`, formData);
      TaskFlow.emit('task:updated', { task: savedTask });
      // サブタスクの進捗が変わった場合、親タスクの進捗も更新
      if (editingTask.parent_id) {
        await updateParentProgress(editingTask.parent_id);
      }
    } else {
      savedTask = await api.post('/api/tasks', formData);
      TaskFlow.emit('task:created', { task: savedTask });
      // 新規サブタスク追加時も親の進捗を更新
      if (formData.parent_id) {
        await updateParentProgress(formData.parent_id);
      }
    }
    setShowTaskForm(false);
    setEditingTask(null);
    setSubtaskParent(null);
    fetchTasks();
    fetchCategories();
  };

  const handleDeleteTask = async (id) => {
    const task = tasks.find(t => t.id === id);
    const isSubtask = task && task.parent_id;
    const parentId = task ? task.parent_id : null;
    if (!confirm(isSubtask ? 'このサブタスクを削除しますか？' : 'このタスクを削除しますか？\n（サブタスクも全て削除されます）')) return;
    await api.del(`/api/tasks/${id}`);
    TaskFlow.emit('task:deleted', { taskId: id });
    // サブタスク削除時は親の進捗を再計算
    if (parentId) {
      // fetchTasksの後にupdateする必要があるため、少し遅延
      await fetchTasks();
      const remainingSubtasks = tasks.filter(t => t.parent_id === parentId && t.id !== id);
      if (remainingSubtasks.length > 0) {
        const avgProgress = Math.round(remainingSubtasks.reduce((s, t) => s + t.progress, 0) / remainingSubtasks.length);
        const status = avgProgress >= 100 ? 'done' : avgProgress > 0 ? 'in_progress' : 'todo';
        await api.put(`/api/tasks/${parentId}`, { progress: avgProgress, status });
      }
      fetchTasks();
    } else {
      fetchTasks();
    }
    fetchCategories();
  };

  const handleEditTask = (task) => { setEditingTask(task); setSubtaskParent(null); setShowTaskForm(true); };

  const handleAddSubtask = (parentTask) => {
    setSubtaskParent(parentTask);
    setEditingTask(null);
    setShowTaskForm(true);
  };

  const handleUpdateProgress = async (taskId, progress) => {
    const task = tasks.find(t => t.id === taskId);
    await api.put(`/api/tasks/${taskId}`, { progress, status: progress >= 100 ? 'done' : progress > 0 ? 'in_progress' : 'todo' });
    // サブタスクの場合、親タスクの進捗も更新
    if (task && task.parent_id) {
      const parentId = task.parent_id;
      const subtasks = tasks.filter(t => t.parent_id === parentId);
      const updatedSubtasks = subtasks.map(t => t.id === taskId ? { ...t, progress } : t);
      const avgProgress = Math.round(updatedSubtasks.reduce((s, t) => s + t.progress, 0) / updatedSubtasks.length);
      const status = avgProgress >= 100 ? 'done' : avgProgress > 0 ? 'in_progress' : 'todo';
      await api.put(`/api/tasks/${parentId}`, { progress: avgProgress, status });
    }
    fetchTasks();
  };

  // 拡張ビューのレンダリング
  const renderExtView = () => {
    const extTab = TaskFlow.tabs.find(t => t.id === view);
    if (!extTab) return null;
    const ExtComponent = extTab.component;
    return <ExtComponent tasks={enrichedTasks} users={users} api={api}
                         refreshTasks={fetchTasks} refreshUsers={fetchUsers} />;
  };

  return (
    <>
      <div className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">✓</div>
          <span>TaskFlow</span>
        </div>
        <div className="tab-group">
          <button className={`tab-btn ${view === 'tasks' ? 'active' : ''}`}
                  onClick={() => setView('tasks')}>📋 タスク一覧</button>
          <button className={`tab-btn ${view === 'gantt' ? 'active' : ''}`}
                  onClick={() => setView('gantt')}>📊 ガントチャート</button>
          {/* 拡張タブ */}
          {TaskFlow.tabs.map(tab => (
            <button key={tab.id}
                    className={`tab-btn ${view === tab.id ? 'active' : ''}`}
                    onClick={() => setView(tab.id)}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div className="header-actions">
          {/* 拡張ヘッダーアクション */}
          {TaskFlow.headerActions.map((action, i) => {
            const Action = action.component;
            return <Action key={i} tasks={enrichedTasks} users={users}
                           refreshTasks={fetchTasks} refreshUsers={fetchUsers} />;
          })}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowUserManager(true)}>
            👥 メンバー
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingTask(null); setSubtaskParent(null); setShowTaskForm(true); }}>
            ＋ 新規タスク
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="🔍 タスク検索..."
               value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <MultiSelectDropdown label="全メンバー"
          options={users.map(u => ({ value: String(u.id), label: u.name }))}
          selected={filterAssignees} onChange={setFilterAssignees} />
        <MultiSelectDropdown label="全ステータス"
          options={[{ value: 'todo', label: '未着手' }, { value: 'in_progress', label: '進行中' }, { value: 'done', label: '完了' }]}
          selected={filterStatuses} onChange={setFilterStatuses} />
        <MultiSelectDropdown label="全カテゴリ"
          options={categories.map(c => ({ value: c, label: c }))}
          selected={filterCategories} onChange={setFilterCategories} />
        <div className="filter-separator" />
        <select value={holidayMode} onChange={e => handleHolidayModeChange(e.target.value)}>
          <option value="weekends">休日: 土日</option>
          <option value="weekends_holidays">休日: 土日祝</option>
        </select>
        {(filterAssignees.length > 0 || filterStatuses.length > 0 || filterCategories.length > 0 || searchQuery) && (
          <button className="btn btn-ghost btn-sm"
                  onClick={() => { setFilterAssignees([]); setFilterStatuses([]); setFilterCategories([]); setSearchQuery(''); }}>
            ✕ クリア
          </button>
        )}
      </div>

      <div className="main-content">
        {view === 'tasks' ? (
          <div className="task-list-view">
            <TaskListView tasks={filteredTasks} users={users}
                          onEdit={handleEditTask} onDelete={handleDeleteTask}
                          onAddSubtask={handleAddSubtask} />
          </div>
        ) : view === 'gantt' ? (
          <GanttChart tasks={filteredTasks} users={users} holidayMode={holidayMode}
                      onUpdateProgress={handleUpdateProgress} onEdit={handleEditTask} />
        ) : renderExtView()}
      </div>

      {showTaskForm && (
        <TaskFormModal
          task={subtaskParent ? { parent_id: subtaskParent.id, start_date: subtaskParent.start_date, category: subtaskParent.category } : editingTask}
          users={users} holidayMode={holidayMode} categories={categories}
          onSave={(formData) => {
            if (subtaskParent && !editingTask?.id) {
              handleSaveTask({ ...formData, parent_id: subtaskParent.id });
            } else {
              handleSaveTask(formData);
            }
          }}
          onClose={() => { setShowTaskForm(false); setEditingTask(null); setSubtaskParent(null); }} />
      )}
      {showUserManager && (
        <UserManagerModal users={users}
                          onClose={() => setShowUserManager(false)}
                          onRefresh={fetchUsers} />
      )}
    </>
  );
}

// 全拡張ロード後に index.html のブートスクリプトが呼ぶ
TaskFlow._boot = () => ReactDOM.createRoot(document.getElementById('root')).render(<App />);
