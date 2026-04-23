import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';

// ─── WebSocket hook ───────────────────────────────────────────────────────────
function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [clientCount, setClientCount] = useState(1);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const WS_URL = `${proto}://${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.clientCount !== undefined) setClientCount(data.clientCount);
        onMessageRef.current(data);
      } catch (_) {}
    };

    ws.onclose = () => {
      setStatus('closed');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, clientCount };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const priorityMeta = {
  low:    { label: 'Low',    color: '#3ecf8e' },
  medium: { label: 'Medium', color: '#f5c842' },
  high:   { label: 'High',   color: '#f5534f' },
};

const statusMeta = {
  pending:     { label: 'Pending',     icon: '○', color: '#6e6d7a' },
  in_progress: { label: 'In Progress', icon: '◑', color: '#f5c842' },
  done:        { label: 'Done',        icon: '●', color: '#3ecf8e' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={S.toastContainer}>
      {toasts.map(t => (
        <div key={t.id} style={{ ...S.toast, ...(t.type === 'ws' ? S.toastWs : t.type === 'error' ? S.toastError : {}) }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── WS Badge ─────────────────────────────────────────────────────────────────
function WsBadge({ status, clientCount }) {
  const colors = { open: '#3ecf8e', connecting: '#f5c842', closed: '#f5534f' };
  const labels = { open: 'Live', connecting: 'Connecting…', closed: 'Reconnecting…' };
  return (
    <div style={S.wsBadge}>
      <span style={{ ...S.wsDot, background: colors[status], boxShadow: `0 0 6px ${colors[status]}` }} />
      <span style={{ color: colors[status], fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 500 }}>
        {labels[status]}
      </span>
      {status === 'open' && clientCount > 0 && (
        <span style={S.wsCount}>{clientCount} online</span>
      )}
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({ task, onClose, onSaved }) {
  const isEdit = !!task;
  const [form, setForm] = useState(
    task
      ? { ...task, due_date: task.due_date ? task.due_date.slice(0, 10) : '' }
      : { title: '', description: '', status: 'pending', priority: 'medium', due_date: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return setError('Заголовок обязателен');
    setSaving(true); setError('');
    try {
      const res = await fetch(isEdit ? `${API}/tasks/${task.id}` : `${API}/tasks`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, due_date: form.due_date || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{isEdit ? 'Редактировать задачу' : 'Новая задача'}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          {error && <div style={S.errBox}>{error}</div>}
          <label style={S.label}>Заголовок *</label>
          <input style={S.input} value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Название задачи" autoFocus />
          <label style={S.label}>Описание</label>
          <textarea style={{ ...S.input, height: 80, resize: 'vertical' }}
            value={form.description || ''} onChange={e => set('description', e.target.value)}
            placeholder="Подробности (необязательно)" />
          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Статус</label>
              <select style={S.select} value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(statusMeta).map(([v, m]) => (
                  <option key={v} value={v}>{m.icon} {m.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Приоритет</label>
              <select style={S.select} value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(priorityMeta).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <label style={S.label}>Срок выполнения</label>
          <input style={S.input} type="date" value={form.due_date || ''}
            onChange={e => set('due_date', e.target.value)} />
        </div>
        <div style={S.modalFoot}>
          <button style={S.btnGhost} onClick={onClose}>Отмена</button>
          <button style={S.btnPrimary} onClick={submit} disabled={saving}>
            {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ task, onClose, onEdit, onDelete }) {
  const sm = statusMeta[task.status] || statusMeta.pending;
  const pm = priorityMeta[task.priority] || priorityMeta.medium;
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Задача <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent2)' }}>#{task.id}</span></span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          <div style={S.detailTitle}>{task.title}</div>
          {task.description && <div style={S.detailDesc}>{task.description}</div>}
          <div style={S.detailGrid}>
            {[
              { label: 'Статус', val: <span style={{ ...S.badge, color: sm.color, background: sm.color+'15', border: `1px solid ${sm.color}40` }}>{sm.icon} {sm.label}</span> },
              { label: 'Приоритет', val: <span style={{ ...S.badge, color: pm.color, background: pm.color+'15', border: `1px solid ${pm.color}40` }}>{pm.label}</span> },
              { label: 'Срок', val: fmtDate(task.due_date) },
              { label: 'ID', val: `#${task.id}` },
              { label: 'Создана', val: `${fmtDate(task.created_at)} ${fmtTime(task.created_at)}` },
              { label: 'Обновлена', val: `${fmtDate(task.updated_at)} ${fmtTime(task.updated_at)}` },
            ].map(({ label, val }) => (
              <div key={label} style={S.detailCell}>
                <span style={S.label}>{label}</span>
                <span style={S.detailVal}>{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.modalFoot}>
          <button style={S.btnDanger} onClick={() => { onDelete(task.id); onClose(); }}>Удалить</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnGhost} onClick={onClose}>Закрыть</button>
            <button style={S.btnPrimary} onClick={() => { onEdit(task); onClose(); }}>Редактировать</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────
function EmailModal({ onClose }) {
  const [tab, setTab] = useState('smtp');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    smtp: { host: 'smtp.gmail.com', port: '587', secure: false, user: '', password: '', to: '', subject: '', body: '' },
    imap: { host: 'imap.gmail.com', port: '993', user: '', password: '' },
    pop3: { host: 'pop.gmail.com', port: '995', user: '', password: '' },
  });

  const set = (k, v) => setForm(f => ({ ...f, [tab]: { ...f[tab], [k]: v } }));

  const submit = async () => {
    setLoading(true); setError(''); setResult(null);
    const ep = { smtp: '/api/email/smtp/send', imap: '/api/email/imap/inbox', pop3: '/api/email/pop3/check' };
    try {
      const res = await fetch(ep[tab], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form[tab]) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 540 }}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>✉ Email</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.tabs}>
          {['smtp', 'imap', 'pop3'].map(t => (
            <button key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
              onClick={() => { setTab(t); setResult(null); setError(''); }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={S.modalBody}>
          <div style={S.protoInfo}>
            {tab === 'smtp' && <><b style={{ color: 'var(--accent2)' }}>SMTP</b> — отправка писем через исходящий сервер</>}
            {tab === 'imap' && <><b style={{ color: 'var(--accent2)' }}>IMAP</b> — чтение почты с синхронизацией на сервере (последние 10)</>}
            {tab === 'pop3' && <><b style={{ color: 'var(--accent2)' }}>POP3</b> — загрузка заголовков писем с сервера (последние 5)</>}
          </div>
          {error && <div style={S.errBox}>{error}</div>}
          {result && (
            <div style={S.successBox}>
              {tab === 'smtp' && `✓ Отправлено! ID: ${result.messageId}`}
              {(tab === 'imap' || tab === 'pop3') && (
                <div>
                  <div>✓ {tab.toUpperCase()}: найдено {result.count} писем</div>
                  {result.emails?.map((e, i) => (
                    <div key={i} style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #3ecf8e20', fontSize: 11, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>{(e.from || '').substring(0, 35)}</span>
                      <span style={{ color: 'rgba(62,207,142,0.7)' }}>{(e.subject || '(без темы)').substring(0, 35)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={S.row}>
            <div style={{ flex: 2 }}>
              <label style={S.label}>Сервер (Host)</label>
              <input style={S.input} value={form[tab].host} onChange={e => set('host', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Порт</label>
              <input style={S.input} value={form[tab].port} onChange={e => set('port', e.target.value)} />
            </div>
          </div>
          <label style={S.label}>Email / Username</label>
          <input style={S.input} type="email" value={form[tab].user} onChange={e => set('user', e.target.value)} placeholder="you@gmail.com" />
          <label style={S.label}>Пароль / App Password</label>
          <input style={S.input} type="password" value={form[tab].password} onChange={e => set('password', e.target.value)} />
          {tab === 'smtp' && <>
            <label style={S.label}>Кому (To)</label>
            <input style={S.input} type="email" value={form.smtp.to} onChange={e => set('to', e.target.value)} placeholder="recipient@example.com" />
            <label style={S.label}>Тема</label>
            <input style={S.input} value={form.smtp.subject} onChange={e => set('subject', e.target.value)} />
            <label style={S.label}>Текст письма</label>
            <textarea style={{ ...S.input, height: 80, resize: 'vertical' }} value={form.smtp.body} onChange={e => set('body', e.target.value)} />
          </>}
        </div>
        <div style={S.modalFoot}>
          <button style={S.btnGhost} onClick={onClose}>Закрыть</button>
          <button style={S.btnPrimary} onClick={submit} disabled={loading}>
            {loading ? 'Подключение…' : tab === 'smtp' ? '↑ Отправить' : tab === 'imap' ? '↓ Fetch IMAP' : '↓ Check POP3'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [highlighted, setHighlighted] = useState(null);

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-4), { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const flash = useCallback((id) => {
    setHighlighted(id);
    setTimeout(() => setHighlighted(null), 1600);
  }, []);

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'INIT') {
      setTasks(data.tasks);
      setLoading(false);
    } else if (data.type === 'TASK_CREATED') {
      setTasks(t => [data.task, ...t.filter(x => x.id !== data.task.id)]);
      flash(data.task.id);
      addToast(`➕ Добавлена: «${data.task.title}»`, 'ws');
    } else if (data.type === 'TASK_UPDATED') {
      setTasks(t => t.map(x => x.id === data.task.id ? data.task : x));
      flash(data.task.id);
      addToast(`✏️ Обновлена: «${data.task.title}»`, 'ws');
    } else if (data.type === 'TASK_DELETED') {
      setTasks(t => t.filter(x => x.id !== data.id));
      addToast('🗑 Задача удалена', 'ws');
    }
  }, [addToast, flash]);

  const { status: wsStatus, clientCount } = useWebSocket(handleWsMessage);

  // Fallback REST fetch if WS init is slow
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!loading) return;
      try {
        const res = await fetch(`${API}/tasks`);
        setTasks(await res.json());
      } finally { setLoading(false); }
    }, 2500);
    return () => clearTimeout(t);
  }, [loading]);

  const deleteTask = async (id) => {
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
  };

  const visible = tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <div style={S.page}>
      <Toast toasts={toasts} />

      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logo}>
            <span style={S.logoMark}>◈</span>
            <span style={S.logoText}>TaskBoard</span>
          </div>
          <WsBadge status={wsStatus} clientCount={clientCount} />
        </div>
        <div style={S.headerRight}>
          <button style={S.btnEmail} onClick={() => setShowEmail(true)}>✉ Email</button>
          <button style={S.btnAdd} onClick={() => setModal('create')}>+ Новая задача</button>
        </div>
      </header>

      <div style={S.toolbar}>
        <div style={S.filters}>
          {[
            { key: 'all', label: 'Все' },
            { key: 'pending', label: '○ Pending' },
            { key: 'in_progress', label: '◑ In Progress' },
            { key: 'done', label: '● Done' },
          ].map(f => (
            <button key={f.key}
              style={{ ...S.filterBtn, ...(filter === f.key ? S.filterActive : {}) }}
              onClick={() => setFilter(f.key)}>
              {f.label}
              <span style={S.filterCount}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <input style={S.search} placeholder="Поиск задач…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{
        ...S.infoBar,
        ...(wsStatus !== 'open' ? { borderColor: '#f5c84240', background: '#f5c84208' } : {}),
      }}>
        {wsStatus === 'open'
          ? <><span style={{ color: '#3ecf8e' }}>⬤</span>&nbsp; WebSocket активен — изменения мгновенно синхронизируются у всех {clientCount} пользователей</>
          : <><span style={{ color: '#f5c842' }}>◌</span>&nbsp; Подключение к WebSocket серверу…</>
        }
      </div>

      <div style={S.tableWrap}>
        {loading ? (
          <div style={S.empty}><div style={S.emptyIcon}>⟳</div><div style={S.emptyText}>Загрузка…</div></div>
        ) : visible.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>◈</div>
            <div style={S.emptyTitle}>Задач нет</div>
            <div style={S.emptyText}>{search ? 'Ничего не найдено' : 'Создайте первую задачу'}</div>
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                {['ID', 'Задача', 'Статус', 'Приоритет', 'Срок', 'Обновлена', 'Действия'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(task => {
                const sm = statusMeta[task.status] || statusMeta.pending;
                const pm = priorityMeta[task.priority] || priorityMeta.medium;
                const isFlash = highlighted === task.id;
                return (
                  <tr key={task.id}
                    style={{ ...S.tr, ...(isFlash ? S.trFlash : {}) }}
                    onClick={() => { setSelected(task); setModal('detail'); }}>
                    <td style={{ ...S.td, ...S.tdMono }}>#{task.id}</td>
                    <td style={{ ...S.td, maxWidth: 260 }}>
                      <div style={{ fontWeight: 500 }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {task.description.substring(0, 55)}{task.description.length > 55 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, color: sm.color, background: sm.color + '18', border: `1px solid ${sm.color}35` }}>
                        {sm.icon} {sm.label}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, color: pm.color, background: pm.color + '18', border: `1px solid ${pm.color}35` }}>
                        {pm.label}
                      </span>
                    </td>
                    <td style={{ ...S.td, ...S.tdMono }}>{fmtDate(task.due_date)}</td>
                    <td style={{ ...S.td, ...S.tdMono }}>{fmtDate(task.updated_at)}</td>
                    <td style={S.td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={S.actionBtn}
                          onClick={() => { setSelected(task); setModal('edit'); }}
                          title="Редактировать">✎</button>
                        <button style={{ ...S.actionBtn, color: 'var(--red)', background: '#f5534f10', border: '1px solid #f5534f30' }}
                          onClick={() => deleteTask(task.id)}
                          title="Удалить">✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal === 'create' && <TaskModal onClose={() => setModal(null)} />}
      {modal === 'edit' && selected && <TaskModal task={selected} onClose={() => setModal(null)} />}
      {modal === 'detail' && selected && (
        <DetailModal task={selected} onClose={() => setModal(null)}
          onEdit={t => { setSelected(t); setModal('edit'); }}
          onDelete={deleteTask} />
      )}
      {showEmail && <EmailModal onClose={() => setShowEmail(false)} />}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0 28px', height: 60,
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    position: 'sticky', top: 0, zIndex: 100,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 20 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoMark: { fontSize: 22, color: 'var(--accent)' },
  logoText: { fontFamily: 'Syne', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' },

  wsBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '4px 10px',
  },
  wsDot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block', transition: 'background 0.3s' },
  wsCount: {
    fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--muted)',
    marginLeft: 2, borderLeft: '1px solid var(--border)', paddingLeft: 6,
  },

  btnAdd: {
    background: 'var(--accent)', color: '#fff', padding: '8px 16px',
    borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'Syne',
  },
  btnEmail: {
    background: 'transparent', color: 'var(--muted2)', padding: '7px 14px',
    borderRadius: 8, fontSize: 13, border: '1px solid var(--border2)',
  },

  toolbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 28px', gap: 12, flexWrap: 'wrap',
  },
  filters: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  filterBtn: {
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid transparent', borderRadius: 8,
    padding: '6px 12px', fontSize: 12, fontFamily: 'JetBrains Mono',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  filterActive: { background: 'var(--surface2)', color: 'var(--ink)', border: '1px solid var(--border2)' },
  filterCount: {
    background: 'var(--border)', color: 'var(--muted2)',
    borderRadius: 10, padding: '1px 6px', fontSize: 10,
  },
  search: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--ink)', borderRadius: 8, padding: '8px 14px',
    fontSize: 13, width: 220, outline: 'none',
  },

  infoBar: {
    margin: '0 28px 12px', padding: '8px 14px', borderRadius: 8,
    border: '1px solid #3ecf8e30', background: '#3ecf8e08',
    fontSize: 12, color: 'var(--muted2)', fontFamily: 'JetBrains Mono',
    display: 'flex', alignItems: 'center',
  },

  tableWrap: {
    margin: '0 28px 40px', border: '1px solid var(--border)',
    borderRadius: 10, overflow: 'hidden', background: 'var(--surface)',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '11px 14px', textAlign: 'left', fontSize: 10,
    fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--muted)',
    background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  tr: {
    cursor: 'pointer', borderBottom: '1px solid var(--border)',
    transition: 'background 0.12s',
  },
  trFlash: { background: 'rgba(124,106,247,0.13)' },
  td: { padding: '12px 14px', fontSize: 13, color: 'var(--ink)', verticalAlign: 'middle' },
  tdMono: { fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted2)' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 6, fontSize: 11,
    fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap',
  },
  actionBtn: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--muted2)', borderRadius: 6,
    width: 28, height: 28, fontSize: 13,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  empty: {
    padding: '64px 24px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 10, textAlign: 'center',
  },
  emptyIcon: { fontSize: 40, color: 'var(--muted)' },
  emptyTitle: { fontFamily: 'Syne', fontWeight: 700, fontSize: 18 },
  emptyText: { color: 'var(--muted)', fontSize: 13 },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(5,5,8,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 16, backdropFilter: 'blur(3px)',
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border2)',
    borderRadius: 12, width: '100%', maxWidth: 500,
    maxHeight: '90vh', overflow: 'auto',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  modalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '18px 22px', borderBottom: '1px solid var(--border)',
  },
  modalTitle: { fontFamily: 'Syne', fontWeight: 700, fontSize: 16 },
  closeBtn: {
    color: 'var(--muted)', fontSize: 13, padding: '4px 8px',
    borderRadius: 6, background: 'var(--surface2)',
  },
  modalBody: {
    padding: '18px 22px', display: 'flex', flexDirection: 'column',
    gap: 10, flex: 1, overflow: 'auto',
  },
  modalFoot: {
    padding: '14px 22px', borderTop: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },

  label: {
    fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4,
  },
  input: {
    width: '100%', padding: '9px 12px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 7, fontSize: 13, color: 'var(--ink)', outline: 'none',
  },
  select: {
    width: '100%', padding: '9px 12px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 7, fontSize: 13, color: 'var(--ink)', outline: 'none', appearance: 'none',
  },
  row: { display: 'flex', gap: 10 },

  btnPrimary: {
    background: 'var(--accent)', color: '#fff', padding: '9px 18px',
    borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'Syne',
  },
  btnGhost: {
    background: 'transparent', color: 'var(--muted2)', padding: '9px 18px',
    borderRadius: 8, fontSize: 13, border: '1px solid var(--border)',
  },
  btnDanger: {
    background: '#f5534f18', color: 'var(--red)',
    border: '1px solid #f5534f30', padding: '9px 14px', borderRadius: 8, fontSize: 13,
  },
  errBox: {
    background: '#f5534f12', border: '1px solid #f5534f40',
    color: 'var(--red)', padding: '9px 12px', borderRadius: 7, fontSize: 12,
  },
  successBox: {
    background: '#3ecf8e10', border: '1px solid #3ecf8e35',
    color: '#3ecf8e', padding: '10px 12px', borderRadius: 7, fontSize: 12, lineHeight: 1.7,
  },

  detailTitle: { fontFamily: 'Syne', fontWeight: 700, fontSize: 20, lineHeight: 1.3 },
  detailDesc: {
    color: 'var(--muted2)', fontSize: 13, lineHeight: 1.6,
    borderLeft: '2px solid var(--border2)', paddingLeft: 10,
  },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 },
  detailCell: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  detailVal: { fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--ink)' },

  tabs: { display: 'flex', borderBottom: '1px solid var(--border)' },
  tab: {
    flex: 1, padding: '12px', fontFamily: 'JetBrains Mono',
    fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)',
    borderBottom: '2px solid transparent', textAlign: 'center',
  },
  tabActive: { color: 'var(--accent2)', borderBottom: '2px solid var(--accent)', background: 'var(--surface2)' },
  protoInfo: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--muted2)', padding: '8px 12px', borderRadius: 7, fontSize: 12, lineHeight: 1.5,
  },

  toastContainer: {
    position: 'fixed', bottom: 24, right: 24,
    display: 'flex', flexDirection: 'column', gap: 8,
    zIndex: 999, pointerEvents: 'none',
  },
  toast: {
    background: 'var(--surface)', border: '1px solid var(--border2)',
    color: 'var(--ink)', padding: '10px 16px', borderRadius: 8,
    fontSize: 13, boxShadow: '0 8px 30px rgba(0,0,0,0.5)', maxWidth: 320,
  },
  toastWs: { borderColor: '#3ecf8e40', background: '#0a1510', color: '#3ecf8e' },
  toastError: { borderColor: '#f5534f40', background: '#150a0a', color: 'var(--red)' },
};
