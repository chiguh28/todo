const { useState, useEffect, useRef, useCallback, useMemo } = React;

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

// ============ Utilities ============
const formatDate = (d) => d ? new Date(d).toLocaleDateString('ja-JP', { month:'short', day:'numeric' }) : '';
const toDateStr = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' };
const STATUS_LABELS = { todo: '未着手', in_progress: '進行中', done: '完了' };
const USER_COLORS = ['#4A90D9','#E8913A','#50B83C','#A78BFA','#FF6B8A','#00C9A7','#FFD93D'];
const HOURS_PER_DAY = 8;

// ---- Japanese public holidays (祝日) ----
const getJapaneseHolidays = (year) => {
  const holidays = new Set();
  const add = (m, d) => holidays.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  const nthMonday = (month, n) => {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow <= 1 ? 1 + (1 - dow) : 1 + (8 - dow);
    return firstMon + (n - 1) * 7;
  };

  add(1, 1);                       // 元日
  add(1, nthMonday(1, 2));         // 成人の日
  add(2, 11);                      // 建国記念の日
  add(2, 23);                      // 天皇誕生日
  // 春分の日 (approximate)
  const shunbun = year <= 2099 ? Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)) : 20;
  add(3, shunbun);
  add(4, 29);                      // 昭和の日
  add(5, 3);                       // 憲法記念日
  add(5, 4);                       // みどりの日
  add(5, 5);                       // こどもの日
  add(7, nthMonday(7, 3));         // 海の日
  add(8, 11);                      // 山の日
  add(9, nthMonday(9, 3));         // 敬老の日
  // 秋分の日 (approximate)
  const shuubun = year <= 2099 ? Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)) : 23;
  add(9, shuubun);
  add(10, nthMonday(10, 2));       // スポーツの日
  add(11, 3);                      // 文化の日
  add(11, 23);                     // 勤労感謝の日

  // 振替休日: holiday on Sunday → next Monday is substitute
  const sorted = [...holidays].sort();
  for (const ds of sorted) {
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

// Cache holidays per year
const _holidayCache = {};
const isJapaneseHoliday = (dateStr) => {
  const y = parseInt(dateStr.slice(0, 4));
  if (!_holidayCache[y]) _holidayCache[y] = getJapaneseHolidays(y);
  return _holidayCache[y].has(dateStr);
};

const isHoliday = (dateStr, mode) => {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  if (mode === 'weekends_holidays' && isJapaneseHoliday(dateStr)) return true;
  return false;
};

// Calculate end_date from start_date + estimated_hours, skipping holidays
const calcEndDate = (startDate, estimatedHours, holidayMode) => {
  if (!startDate || !estimatedHours || estimatedHours <= 0) return startDate;
  let remainingDays = Math.ceil(estimatedHours / HOURS_PER_DAY);
  const d = new Date(startDate + 'T00:00:00');
  // If start_date itself is a holiday, advance to first working day
  while (isHoliday(toDateStr(d), holidayMode)) d.setDate(d.getDate() + 1);
  remainingDays--; // first working day counts
  while (remainingDays > 0) {
    d.setDate(d.getDate() + 1);
    if (!isHoliday(toDateStr(d), holidayMode)) remainingDays--;
  }
  return toDateStr(d);
};

// Enrich tasks with computed end_date
const enrichTasks = (tasks, holidayMode) => tasks.map(t => ({
  ...t,
  end_date: calcEndDate(t.start_date, t.estimated_hours, holidayMode),
}));

// Schedule health: compares today vs end_date
const getScheduleStatus = (task) => {
  if (task.status === 'done') return 'done';
  const today = new Date().toISOString().split('T')[0];
  if (task.end_date < today) return 'overdue';
  if (daysBetween(today, task.end_date) <= 2) return 'due-soon';
  return 'on-track';
};
const SCHEDULE_BADGES = { overdue: '遅延', 'due-soon': '期限近' };

// Progress bar color based on schedule health
const getProgressColor = (task) => {
  if (task.progress >= 100 || task.status === 'done') return 'var(--success)';
  const status = getScheduleStatus(task);
  if (status === 'overdue') return 'var(--danger)';
  if (status === 'due-soon' && task.progress < 80) return 'var(--warning)';
  if (task.progress >= 50) return 'var(--accent)';
  return 'var(--warning)';
};

// ============ TaskFormModal ============
function TaskFormModal({ task, users, holidayMode, onSave, onClose }) {
  const isEdit = !!task?.id;
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignee_id: task?.assignee_id || '',
    start_date: task?.start_date || today,
    estimated_hours: task?.estimated_hours || 8,
    progress: task?.progress || 0,
    priority: task?.priority || 'medium',
    status: task?.status || 'todo',
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const previewEndDate = useMemo(
    () => calcEndDate(form.start_date, form.estimated_hours, holidayMode),
    [form.start_date, form.estimated_hours, holidayMode]
  );
  const previewDays = useMemo(
    () => Math.ceil(form.estimated_hours / HOURS_PER_DAY),
    [form.estimated_hours]
  );

  const handleSubmit = () => {
    if (!form.title.trim()) return alert('タイトルを入力してください');
    if (!form.start_date) return alert('開始日を入力してください');
    if (!form.estimated_hours || form.estimated_hours <= 0) return alert('工数を入力してください');
    onSave({ ...form, assignee_id: form.assignee_id || null });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'タスク編集' : '新規タスク'}</div>
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
          <label>進捗率: {form.progress}%</label>
          <input type="range" min="0" max="100" step="5"
                 value={form.progress} onChange={e => set('progress', parseInt(e.target.value))} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {isEdit ? '更新' : '作成'}
          </button>
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
function TaskListView({ tasks, users, onEdit, onDelete }) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const avgProgress = totalTasks ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / totalTasks) : 0;

  if (totalTasks === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-text">まだタスクがありません<br/>「+新規タスク」から最初のタスクを作成しましょう</div>
      </div>
    );
  }

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
            <th style={{width:80}}>担当</th>
            <th style={{width:60}}>優先度</th>
            <th style={{width:70}}>ステータス</th>
            <th style={{width:130}}>期間</th>
            <th style={{width:130}}>進捗</th>
            <th style={{width:80}}></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => (
            <tr key={t.id}>
              <td style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--mono)' }}>{i+1}</td>
              <td className="task-title-cell" onClick={() => onEdit(t)}>{t.title}</td>
              <td>
                {t.assignee_name ? (
                  <span className="assignee-chip">
                    <span className="assignee-dot" style={{ background: t.assignee_color }} />
                    {t.assignee_name}
                  </span>
                ) : <span style={{ color:'var(--text-muted)' }}>—</span>}
              </td>
              <td>
                <span className={`priority-badge priority-${t.priority}`}>
                  {PRIORITY_LABELS[t.priority]}
                </span>
              </td>
              <td>
                <span className={`status-badge status-${t.status}`}>
                  {STATUS_LABELS[t.status]}
                </span>
              </td>
              <td>
                {(() => {
                  const s = getScheduleStatus(t);
                  return (
                    <div className={`schedule-cell schedule-${s}`}>
                      <span className="schedule-date">
                        {formatDate(t.start_date)}〜{formatDate(t.end_date)}
                      </span>
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
                <div className="action-btns">
                  <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)} title="編集">✏️</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onDelete(t.id)} title="削除">🗑️</button>
                </div>
              </td>
            </tr>
          ))}
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
  const DAY_WIDTH = 36;

  const sortedTasks = useMemo(() => {
    if (!sortByDate) return tasks;
    return [...tasks].sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [tasks, sortByDate]);

  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      return { start, end };
    }
    const dates = tasks.flatMap(t => [new Date(t.start_date), new Date(t.end_date)]);
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    min.setDate(min.getDate() - 5);
    max.setDate(max.getDate() + 10);
    return { start: min, end: max };
  }, [tasks]);

  const days = useMemo(() => {
    const result = [];
    const d = new Date(dateRange.start);
    while (d <= dateRange.end) {
      result.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [dateRange]);

  const months = useMemo(() => {
    const m = [];
    let current = null;
    days.forEach((d, i) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== current) {
        current = key;
        m.push({ year: d.getFullYear(), month: d.getMonth(), startIndex: i, count: 0 });
      }
      m[m.length - 1].count++;
    });
    return m;
  }, [days]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayIndex = days.findIndex(d => d.toISOString().split('T')[0] === todayStr);
  const totalWidth = days.length * DAY_WIDTH;

  const handleChartScroll = useCallback((e) => {
    if (sidebarBodyRef.current) {
      sidebarBodyRef.current.scrollTop = e.target.scrollTop;
    }
  }, []);

  useEffect(() => {
    if (chartRef.current && todayIndex >= 0) {
      chartRef.current.scrollLeft = Math.max(0, todayIndex * DAY_WIDTH - 300);
    }
  }, [todayIndex]);

  const handleBarClick = (e, task) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      task,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
      progress: task.progress,
    });
  };

  const handleProgressChange = (value) => {
    setPopover(prev => ({ ...prev, progress: value }));
  };

  const handleProgressSave = () => {
    if (popover) {
      onUpdateProgress(popover.task.id, popover.progress);
      setPopover(null);
    }
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
      {/* Sidebar */}
      <div className="gantt-sidebar">
        <div className="gantt-sidebar-header">
          <span>タスク一覧</span>
          <button className={`btn btn-ghost btn-sm gantt-sort-btn ${sortByDate ? 'active' : ''}`}
                  onClick={() => setSortByDate(v => !v)}
                  title="開始日順にソート">
            📅 開始日順
          </button>
        </div>
        <div className="gantt-sidebar-body" ref={sidebarBodyRef}>
          {sortedTasks.map(t => (
            <div key={t.id} className="gantt-sidebar-row" onClick={() => onEdit(t)}>
              <span className="assignee-dot" style={{ background: t.assignee_color || '#666', flexShrink:0 }} />
              <span className="gantt-sidebar-title">{t.title}</span>
              <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text-muted)', flexShrink:0 }}>
                {t.estimated_hours}h
              </span>
              <span style={{ fontSize:11, fontFamily:'var(--mono)', color: getProgressColor(t), flexShrink:0 }}>
                {t.progress}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="gantt-chart-area" ref={chartRef} onScroll={handleChartScroll}>
        {/* Header */}
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
              const off = isHoliday(ds, holidayMode);
              const isToday = ds === todayStr;
              return (
                <div key={i}
                     className={`gantt-day-cell ${off ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
                     style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}>
                  {d.getDate()}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="gantt-body" style={{ width: totalWidth, position: 'relative' }}>
          {sortedTasks.map(t => (
            <div key={t.id} className="gantt-row">
              {days.map((d, i) => {
                const off = isHoliday(toDateStr(d), holidayMode);
                return (
                  <div key={i}
                       className={`gantt-cell ${off ? 'weekend' : ''}`}
                       style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }} />
                );
              })}
            </div>
          ))}

          {sortedTasks.map((t, rowIndex) => {
            const startDay = daysBetween(toDateStr(dateRange.start), t.start_date);
            const duration = daysBetween(t.start_date, t.end_date) + 1;
            const left = startDay * DAY_WIDTH;
            const width = duration * DAY_WIDTH;
            const barColor = t.assignee_color || '#666';
            const isOverdue = getScheduleStatus(t) === 'overdue';

            return (
              <div key={t.id} className="gantt-bar-wrapper"
                   style={{ top: rowIndex * 40, left, width }}
                   onClick={(e) => handleBarClick(e, t)}>
                {/* Schedule bar (top) */}
                <div className={`gantt-bar-schedule ${isOverdue ? 'gantt-bar-overdue' : ''}`}
                     style={{ background: barColor + '20', border: isOverdue ? '2px solid var(--danger)' : `2px solid ${barColor}` }}>
                  <div className="gantt-bar-label">{width > 80 ? t.title : ''}</div>
                </div>
                {/* Progress bar (bottom) */}
                <div className="gantt-bar-actual"
                     style={{ width: `${t.progress}%`, background: getProgressColor(t) }} />
              </div>
            );
          })}

          {todayIndex >= 0 && (
            <div className="today-line"
                 style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2, height: sortedTasks.length * 40 }} />
          )}
        </div>
      </div>

      {/* Progress Popover */}
      {popover && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={() => setPopover(null)} />
          <div className="progress-popover"
               style={{ left: popover.x - 100, top: popover.y }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{popover.task.title}</div>
            <div className="progress-popover-value">{popover.progress}%</div>
            <input type="range" min="0" max="100" step="5"
                   value={popover.progress}
                   onChange={e => handleProgressChange(parseInt(e.target.value))} />
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
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showUserManager, setShowUserManager] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [holidayMode, setHolidayMode] = useState(() => localStorage.getItem('holidayMode') || 'weekends');

  const handleHolidayModeChange = (mode) => {
    setHolidayMode(mode);
    localStorage.setItem('holidayMode', mode);
  };

  const fetchTasks = async () => { setTasks(await api.get('/api/tasks')); };
  const fetchUsers = async () => { setUsers(await api.get('/api/users')); };

  useEffect(() => { fetchTasks(); fetchUsers(); }, []);

  const enrichedTasks = useMemo(() => enrichTasks(tasks, holidayMode), [tasks, holidayMode]);

  const filteredTasks = useMemo(() => {
    return enrichedTasks.filter(t => {
      if (filterAssignee && String(t.assignee_id) !== filterAssignee) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [enrichedTasks, filterAssignee, filterStatus, searchQuery]);

  const handleSaveTask = async (formData) => {
    if (editingTask?.id) {
      await api.put(`/api/tasks/${editingTask.id}`, formData);
    } else {
      await api.post('/api/tasks', formData);
    }
    setShowTaskForm(false);
    setEditingTask(null);
    fetchTasks();
  };

  const handleDeleteTask = async (id) => {
    if (!confirm('このタスクを削除しますか？')) return;
    await api.del(`/api/tasks/${id}`);
    fetchTasks();
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleUpdateProgress = async (taskId, progress) => {
    await api.put(`/api/tasks/${taskId}`, { progress, status: progress >= 100 ? 'done' : progress > 0 ? 'in_progress' : 'todo' });
    fetchTasks();
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
        </div>

        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowUserManager(true)}>
            👥 メンバー
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingTask(null); setShowTaskForm(true); }}>
            ＋ 新規タスク
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <input className="search-input" placeholder="🔍 タスク検索..."
               value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
          <option value="">全メンバー</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          <option value="todo">未着手</option>
          <option value="in_progress">進行中</option>
          <option value="done">完了</option>
        </select>
        <div className="filter-separator" />
        <select value={holidayMode} onChange={e => handleHolidayModeChange(e.target.value)}>
          <option value="weekends">休日: 土日</option>
          <option value="weekends_holidays">休日: 土日祝</option>
        </select>
        {(filterAssignee || filterStatus || searchQuery) && (
          <button className="btn btn-ghost btn-sm"
                  onClick={() => { setFilterAssignee(''); setFilterStatus(''); setSearchQuery(''); }}>
            ✕ クリア
          </button>
        )}
      </div>

      <div className="main-content">
        {view === 'tasks' ? (
          <div className="task-list-view">
            <TaskListView tasks={filteredTasks} users={users}
                          onEdit={handleEditTask} onDelete={handleDeleteTask} />
          </div>
        ) : (
          <GanttChart tasks={filteredTasks} users={users} holidayMode={holidayMode}
                      onUpdateProgress={handleUpdateProgress} onEdit={handleEditTask} />
        )}
      </div>

      {/* Modals */}
      {showTaskForm && (
        <TaskFormModal task={editingTask} users={users} holidayMode={holidayMode}
                       onSave={handleSaveTask}
                       onClose={() => { setShowTaskForm(false); setEditingTask(null); }} />
      )}
      {showUserManager && (
        <UserManagerModal users={users}
                          onClose={() => setShowUserManager(false)}
                          onRefresh={fetchUsers} />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
