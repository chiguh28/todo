(() => {
  const { useState, useMemo, useRef, useEffect, useCallback } = React;

  // ============ KPI Card ============
  function KPICard({ icon, label, value, sub, color }) {
    return (
      <div className="stats-kpi-card">
        <div className="stats-kpi-icon" style={{ background: color + '15', color }}>{icon}</div>
        <div className="stats-kpi-body">
          <div className="stats-kpi-value">{value}</div>
          <div className="stats-kpi-label">{label}</div>
          {sub && <div className="stats-kpi-sub">{sub}</div>}
        </div>
      </div>
    );
  }

  // ============ SVG Donut Chart ============
  function DonutChart({ data, title, size }) {
    size = size || 160;
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) {
      return (
        <div className="stats-donut-container">
          <div className="stats-donut-title">{title}</div>
          <div className="stats-chart-empty">データなし</div>
        </div>
      );
    }

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 20;
    const strokeWidth = size * 0.14;
    const circumference = 2 * Math.PI * radius;

    let cumAngle = 0;
    const segments = data.filter(d => d.value > 0).map(d => {
      const pct = d.value / total;
      const angle = pct * 360;
      const seg = { ...d, pct, angle, startAngle: cumAngle };
      cumAngle += angle;
      return seg;
    });

    return (
      <div className="stats-donut-container">
        <div className="stats-donut-title">{title}</div>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
             style={{ display: 'block', margin: '0 auto' }}>
          {segments.map((seg, i) => (
            <circle key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              style={{ stroke: seg.color }}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.pct * circumference} ${circumference}`}
              transform={`rotate(${seg.startAngle - 90} ${cx} ${cy})`}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle"
                style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', fill: 'var(--text-primary)' }}>
            {total}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle"
                style={{ fontSize: 11, fill: 'var(--text-muted)' }}>
            合計
          </text>
        </svg>
        <div className="stats-donut-legend">
          {data.map((d, i) => (
            <div key={i} className="stats-donut-legend-item">
              <span className="stats-donut-legend-dot" style={{ background: d.color }} />
              <span className="stats-donut-legend-label">{d.label}</span>
              <span className="stats-donut-legend-value">{d.value}</span>
              <span className="stats-donut-legend-pct">
                ({total ? Math.round(d.value / total * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ============ S-Curve Chart ============
  function SCurveChart({ tasks }) {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [tooltip, setTooltip] = useState(null);

    useEffect(() => {
      if (!containerRef.current) return;
      const ro = new ResizeObserver(entries => {
        if (entries[0]) setContainerWidth(entries[0].contentRect.width);
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, []);

    const chartData = useMemo(() => {
      if (tasks.length === 0) return null;

      const totalHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
      if (totalHours === 0) return null;

      const startDates = tasks.map(t => t.start_date).filter(Boolean).sort();
      const endDates = tasks.map(t => t.end_date).filter(Boolean).sort();
      if (startDates.length === 0 || endDates.length === 0) return null;

      const projectStart = startDates[0];
      const projectEnd = endDates[endDates.length - 1];
      const today = new Date().toISOString().split('T')[0];
      const chartEnd = projectEnd > today ? projectEnd : today;

      // Generate dates
      const dates = [];
      const d = new Date(projectStart + 'T00:00:00');
      const endD = new Date(chartEnd + 'T00:00:00');
      while (d <= endD) {
        dates.push(toDateStr(d));
        d.setDate(d.getDate() + 1);
      }
      if (dates.length < 2) return null;

      // Planned cumulative: sum of hours for tasks whose end_date <= date
      const planned = dates.map(date => {
        const hours = tasks
          .filter(t => t.end_date && t.end_date <= date)
          .reduce((s, t) => s + (t.estimated_hours || 0), 0);
        return (hours / totalHours) * 100;
      });

      // Actual earned value
      const todayIdx = dates.indexOf(today);

      // For done tasks: earned at their end_date (or today if end_date is future)
      // For in-progress: contribute partial at today
      const actual = dates.map((date, i) => {
        if (todayIdx >= 0 && i > todayIdx) return null;

        let earned = 0;
        tasks.forEach(t => {
          if (t.status === 'done' && t.end_date) {
            // Done task: assume completed by its end_date
            const completionDate = t.end_date <= today ? t.end_date : today;
            if (date >= completionDate) {
              earned += t.estimated_hours || 0;
            }
          } else if (date === today) {
            // In-progress / todo: partial progress at today only
            earned += (t.estimated_hours || 0) * (t.progress || 0) / 100;
          }
        });
        return (earned / totalHours) * 100;
      });

      const plannedToday = todayIdx >= 0 ? planned[todayIdx] : null;
      const earnedToday = todayIdx >= 0 ? actual[todayIdx] : null;

      return { dates, planned, actual, today, todayIdx, plannedToday, earnedToday, totalHours };
    }, [tasks]);

    if (!chartData) {
      return (
        <div className="stats-chart-card" ref={containerRef}>
          <div className="stats-chart-title">計画 vs 実績（Sカーブ）</div>
          <div className="stats-chart-empty">タスクデータが不足しています</div>
        </div>
      );
    }

    const { dates, planned, actual, today, todayIdx, plannedToday, earnedToday } = chartData;

    const width = containerWidth;
    const height = 320;
    const margin = { top: 24, right: 30, bottom: 52, left: 52 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const xScale = (i) => margin.left + (i / Math.max(dates.length - 1, 1)) * chartW;
    const yScale = (v) => margin.top + chartH - (v / 100) * chartH;

    // Build paths
    const buildPath = (values) => {
      return values
        .map((v, i) => v !== null ? `${i === 0 || values[i - 1] === null ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}` : '')
        .filter(Boolean)
        .join(' ');
    };

    const plannedPath = buildPath(planned);
    const actualPath = buildPath(actual);

    // Area paths
    const firstActualIdx = actual.findIndex(v => v !== null);
    const lastActualIdx = (() => { for (let i = actual.length - 1; i >= 0; i--) if (actual[i] !== null) return i; return -1; })();

    const plannedAreaPath = plannedPath +
      ` L ${xScale(dates.length - 1).toFixed(1)} ${yScale(0).toFixed(1)}` +
      ` L ${xScale(0).toFixed(1)} ${yScale(0).toFixed(1)} Z`;

    const actualAreaPath = lastActualIdx >= 0
      ? actualPath +
        ` L ${xScale(lastActualIdx).toFixed(1)} ${yScale(0).toFixed(1)}` +
        ` L ${xScale(firstActualIdx).toFixed(1)} ${yScale(0).toFixed(1)} Z`
      : '';

    // X-axis labels
    const maxLabels = Math.floor(chartW / 70);
    const labelInterval = Math.max(1, Math.ceil(dates.length / maxLabels));

    // Mouse hover for tooltip
    const handleMouseMove = useCallback((e) => {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - svgRect.left;
      const idx = Math.round(((mouseX - margin.left) / chartW) * (dates.length - 1));
      if (idx >= 0 && idx < dates.length) {
        setTooltip({
          idx,
          x: e.clientX - svgRect.left,
          y: e.clientY - svgRect.top,
          date: dates[idx],
          planned: planned[idx],
          actual: actual[idx],
        });
      }
    }, [dates, planned, actual, chartW, margin.left]);

    const handleMouseLeave = useCallback(() => setTooltip(null), []);

    return (
      <div className="stats-chart-card" ref={containerRef}>
        <div className="stats-chart-header">
          <div className="stats-chart-title">計画 vs 実績（Sカーブ）</div>
          <div className="stats-chart-legend">
            <span className="stats-legend-item">
              <span className="stats-legend-line" style={{ background: 'var(--accent)' }} />
              計画
            </span>
            <span className="stats-legend-item">
              <span className="stats-legend-line" style={{ background: 'var(--success)' }} />
              実績
            </span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <svg width={width} height={height}
               onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
               style={{ display: 'block' }}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(v => (
              <g key={v}>
                <line x1={margin.left} y1={yScale(v)} x2={width - margin.right} y2={yScale(v)}
                      style={{ stroke: 'var(--border)' }}
                      strokeDasharray={v > 0 && v < 100 ? '4 4' : 'none'} />
                <text x={margin.left - 8} y={yScale(v) + 4} textAnchor="end"
                      className="stats-axis-label">{v}%</text>
              </g>
            ))}

            {/* Area fills */}
            <path d={plannedAreaPath} style={{ fill: 'var(--accent)' }} opacity={0.06} />
            {actualAreaPath && <path d={actualAreaPath} style={{ fill: 'var(--success)' }} opacity={0.1} />}

            {/* Lines */}
            <path d={plannedPath} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round" />
            {actualPath && (
              <path d={actualPath} fill="none" style={{ stroke: 'var(--success)' }} strokeWidth={2.5}
                    strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Today line */}
            {todayIdx >= 0 && (
              <g>
                <line x1={xScale(todayIdx)} y1={margin.top}
                      x2={xScale(todayIdx)} y2={height - margin.bottom}
                      style={{ stroke: 'var(--today-line)' }} strokeWidth={1.5} strokeDasharray="6 3" />
                <text x={xScale(todayIdx)} y={margin.top - 8} textAnchor="middle"
                      className="stats-today-label">今日</text>
              </g>
            )}

            {/* Data points at today */}
            {todayIdx >= 0 && plannedToday != null && (
              <circle cx={xScale(todayIdx)} cy={yScale(plannedToday)} r={5}
                      style={{ fill: 'var(--accent)', stroke: 'white' }} strokeWidth={2} />
            )}
            {todayIdx >= 0 && earnedToday != null && (
              <circle cx={xScale(todayIdx)} cy={yScale(earnedToday)} r={5}
                      style={{ fill: 'var(--success)', stroke: 'white' }} strokeWidth={2} />
            )}

            {/* Tooltip crosshair */}
            {tooltip && (
              <g>
                <line x1={xScale(tooltip.idx)} y1={margin.top}
                      x2={xScale(tooltip.idx)} y2={height - margin.bottom}
                      style={{ stroke: 'var(--text-muted)' }} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                {tooltip.planned != null && (
                  <circle cx={xScale(tooltip.idx)} cy={yScale(tooltip.planned)} r={4}
                          style={{ fill: 'var(--accent)' }} />
                )}
                {tooltip.actual != null && (
                  <circle cx={xScale(tooltip.idx)} cy={yScale(tooltip.actual)} r={4}
                          style={{ fill: 'var(--success)' }} />
                )}
              </g>
            )}

            {/* X-axis */}
            <line x1={margin.left} y1={height - margin.bottom}
                  x2={width - margin.right} y2={height - margin.bottom}
                  style={{ stroke: 'var(--border)' }} />
            {dates.map((d, i) => i % labelInterval === 0 ? (
              <text key={i} x={xScale(i)} y={height - margin.bottom + 18}
                    textAnchor="middle" className="stats-axis-label"
                    transform={`rotate(-30 ${xScale(i)} ${height - margin.bottom + 18})`}>
                {formatDate(d)}
              </text>
            ) : null)}

            {/* Left axis line */}
            <line x1={margin.left} y1={margin.top}
                  x2={margin.left} y2={height - margin.bottom}
                  style={{ stroke: 'var(--border)' }} />
          </svg>

          {/* Tooltip popup */}
          {tooltip && (
            <div className="stats-tooltip"
                 style={{ left: Math.min(tooltip.x + 12, width - 180), top: tooltip.y - 10 }}>
              <div className="stats-tooltip-date">{formatDate(tooltip.date)}</div>
              <div className="stats-tooltip-row">
                <span className="stats-tooltip-dot" style={{ background: 'var(--accent)' }} />
                計画: {tooltip.planned != null ? Math.round(tooltip.planned) : '—'}%
              </div>
              {tooltip.actual != null && (
                <div className="stats-tooltip-row">
                  <span className="stats-tooltip-dot" style={{ background: 'var(--success)' }} />
                  実績: {Math.round(tooltip.actual)}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary bar */}
        {todayIdx >= 0 && plannedToday != null && earnedToday != null && (
          <div className="stats-scurve-summary">
            <span>計画: <strong>{Math.round(plannedToday)}%</strong></span>
            <span>実績: <strong>{Math.round(earnedToday)}%</strong></span>
            <span className={earnedToday >= plannedToday ? 'stats-variance-positive' : 'stats-variance-negative'}>
              差異: {earnedToday >= plannedToday ? '+' : ''}{Math.round(earnedToday - plannedToday)}%
              {earnedToday >= plannedToday ? '（順調）' : '（遅延）'}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ============ Schedule Health ============
  function ScheduleHealth({ tasks }) {
    const health = useMemo(() => {
      const done = tasks.filter(t => getScheduleStatus(t) === 'done').length;
      const overdue = tasks.filter(t => getScheduleStatus(t) === 'overdue').length;
      const dueSoon = tasks.filter(t => getScheduleStatus(t) === 'due-soon').length;
      const onTrack = tasks.filter(t => getScheduleStatus(t) === 'on-track').length;
      return [
        { label: '完了', value: done, color: 'var(--success)' },
        { label: '順調', value: onTrack, color: 'var(--accent)' },
        { label: '期限近', value: dueSoon, color: 'var(--warning)' },
        { label: '遅延', value: overdue, color: 'var(--danger)' },
      ];
    }, [tasks]);

    const total = tasks.length;
    if (total === 0) return null;

    return (
      <div className="stats-donut-container">
        <div className="stats-donut-title">スケジュール健全性</div>
        <div className="stats-health-bar">
          {health.filter(h => h.value > 0).map((h, i) => (
            <div key={i} className="stats-health-segment"
                 style={{ width: `${(h.value / total) * 100}%`, background: h.color }}
                 title={`${h.label}: ${h.value}件`}>
              {(h.value / total) > 0.08 && <span>{h.value}</span>}
            </div>
          ))}
        </div>
        <div className="stats-donut-legend">
          {health.map((h, i) => (
            <div key={i} className="stats-donut-legend-item">
              <span className="stats-donut-legend-dot" style={{ background: h.color }} />
              <span className="stats-donut-legend-label">{h.label}</span>
              <span className="stats-donut-legend-value">{h.value}</span>
              <span className="stats-donut-legend-pct">({Math.round(h.value / total * 100)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ============ Member Workload ============
  function MemberStats({ tasks, users }) {
    const memberData = useMemo(() => {
      return users.map(u => {
        const userTasks = tasks.filter(t => t.assignee_id === u.id);
        const total = userTasks.length;
        const done = userTasks.filter(t => t.status === 'done').length;
        const avgProgress = total ? Math.round(userTasks.reduce((s, t) => s + t.progress, 0) / total) : 0;
        const totalHours = userTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
        const earnedHours = Math.round(userTasks.reduce((s, t) => s + (t.estimated_hours || 0) * (t.progress || 0) / 100, 0));
        const overdue = userTasks.filter(t => getScheduleStatus(t) === 'overdue').length;
        return { ...u, total, done, avgProgress, totalHours, earnedHours, overdue };
      }).filter(m => m.total > 0);
    }, [tasks, users]);

    const unassigned = useMemo(() => tasks.filter(t => !t.assignee_id).length, [tasks]);

    if (memberData.length === 0 && unassigned === 0) return null;

    const maxHours = Math.max(...memberData.map(m => m.totalHours), 1);

    return (
      <div className="stats-card">
        <div className="stats-card-title">メンバー別ワークロード</div>
        <div className="stats-member-table">
          <div className="stats-member-header-row">
            <div className="stats-member-col-name">メンバー</div>
            <div className="stats-member-col-bar">工数消化</div>
            <div className="stats-member-col-metric">タスク</div>
            <div className="stats-member-col-metric">進捗</div>
            <div className="stats-member-col-metric">工数</div>
            <div className="stats-member-col-metric">状態</div>
          </div>
          {memberData.map(m => (
            <div key={m.id} className="stats-member-row">
              <div className="stats-member-col-name">
                <span className="assignee-dot" style={{ background: m.color }} />
                <span>{m.name}</span>
              </div>
              <div className="stats-member-col-bar">
                <div className="stats-member-bar-bg">
                  <div className="stats-member-bar-total"
                       style={{ width: `${(m.totalHours / maxHours) * 100}%`, background: m.color + '25' }}>
                    <div className="stats-member-bar-earned"
                         style={{ width: `${m.totalHours ? (m.earnedHours / m.totalHours) * 100 : 0}%`, background: m.color }} />
                  </div>
                </div>
              </div>
              <div className="stats-member-col-metric">
                <span className="stats-member-fraction">{m.done}<span className="stats-member-sep">/</span>{m.total}</span>
              </div>
              <div className="stats-member-col-metric">
                <span className="stats-member-pct">{m.avgProgress}%</span>
              </div>
              <div className="stats-member-col-metric">
                <span>{m.earnedHours}<span className="stats-member-sep">/</span>{m.totalHours}h</span>
              </div>
              <div className="stats-member-col-metric">
                {m.overdue > 0
                  ? <span className="stats-member-overdue">{m.overdue}件遅延</span>
                  : <span className="stats-member-ok">順調</span>}
              </div>
            </div>
          ))}
          {unassigned > 0 && (
            <div className="stats-member-row stats-member-unassigned">
              <div className="stats-member-col-name">
                <span className="assignee-dot" style={{ background: '#999' }} />
                <span>未割当</span>
              </div>
              <div className="stats-member-col-bar" />
              <div className="stats-member-col-metric"><span>{unassigned}件</span></div>
              <div className="stats-member-col-metric" />
              <div className="stats-member-col-metric" />
              <div className="stats-member-col-metric" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ Main StatsView ============
  function StatsView({ tasks, users }) {
    const stats = useMemo(() => {
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'done').length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const avgProgress = total ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total) : 0;
      const totalHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
      const earnedHours = Math.round(tasks.reduce((s, t) => s + (t.estimated_hours || 0) * (t.progress || 0) / 100, 0));
      const overdue = tasks.filter(t => getScheduleStatus(t) === 'overdue').length;
      return { total, done, inProgress, avgProgress, totalHours, earnedHours, overdue };
    }, [tasks]);

    const statusData = useMemo(() => [
      { label: '未着手', value: tasks.filter(t => t.status === 'todo').length, color: '#8E93A6' },
      { label: '進行中', value: tasks.filter(t => t.status === 'in_progress').length, color: '#4A74E8' },
      { label: '完了', value: tasks.filter(t => t.status === 'done').length, color: '#28A070' },
    ], [tasks]);

    const priorityData = useMemo(() => [
      { label: '高', value: tasks.filter(t => t.priority === 'high').length, color: '#E04E4E' },
      { label: '中', value: tasks.filter(t => t.priority === 'medium').length, color: '#D48E1C' },
      { label: '低', value: tasks.filter(t => t.priority === 'low').length, color: '#28A070' },
    ], [tasks]);

    if (tasks.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <div className="empty-state-text">タスクを登録すると統計が表示されます</div>
        </div>
      );
    }

    return (
      <div className="stats-dashboard">
        {/* KPI Cards */}
        <div className="stats-kpi-row">
          <KPICard icon="📋" label="タスク完了"
                   value={`${stats.done} / ${stats.total}`}
                   sub={`完了率 ${stats.total ? Math.round(stats.done / stats.total * 100) : 0}%`}
                   color="#4A74E8" />
          <KPICard icon="📊" label="平均進捗率"
                   value={`${stats.avgProgress}%`}
                   sub={`進行中 ${stats.inProgress}件`}
                   color="#28A070" />
          <KPICard icon="⏱" label="工数消化"
                   value={`${stats.earnedHours}h / ${stats.totalHours}h`}
                   sub={`消化率 ${stats.totalHours ? Math.round(stats.earnedHours / stats.totalHours * 100) : 0}%`}
                   color="#D48E1C" />
          <KPICard icon="⚠" label="遅延タスク"
                   value={`${stats.overdue}件`}
                   sub={stats.overdue > 0 ? '対応が必要です' : '遅延なし'}
                   color={stats.overdue > 0 ? '#E04E4E' : '#28A070'} />
        </div>

        {/* S-Curve */}
        <SCurveChart tasks={tasks} />

        {/* Charts Row */}
        <div className="stats-charts-row">
          <DonutChart data={statusData} title="ステータス分布" />
          <DonutChart data={priorityData} title="優先度分布" />
          <ScheduleHealth tasks={tasks} />
        </div>

        {/* Member Stats */}
        <MemberStats tasks={tasks} users={users} />
      </div>
    );
  }

  // Register extension
  TaskFlow.registerExtension({
    name: 'stats_dashboard',
    label: '統計ダッシュボード',
    tabs: [{
      id: 'stats_dashboard',
      label: '統計',
      icon: '📈',
      component: StatsView,
    }],
  });
})();
