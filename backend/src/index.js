const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// ─── PostgreSQL ───────────────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'todoapp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function initDB() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          priority VARCHAR(20) DEFAULT 'medium',
          due_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Database initialized');
      return;
    } catch (err) {
      console.log(`DB not ready, retrying... (${retries} left): ${err.message}`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to database');
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

function broadcastCount() {
  broadcast({ type: 'CLIENT_COUNT', clientCount: wss.clients.size });
}

wss.on('connection', (ws) => {
  console.log(`🔌 WebSocket connected [total: ${wss.clients.size}]`);

  // Send current tasks + client count to new client
  pool.query('SELECT * FROM tasks ORDER BY created_at DESC')
    .then(result => {
      ws.send(JSON.stringify({
        type: 'INIT',
        tasks: result.rows,
        clientCount: wss.clients.size,
      }));
    })
    .catch(err => console.error('WS init error:', err));

  // Tell everyone about new client count
  broadcastCount();

  ws.on('close', () => {
    console.log(`🔌 WebSocket disconnected [total: ${wss.clients.size}]`);
    broadcastCount();
  });

  ws.on('error', err => console.error('WS error:', err.message));
});

// ─── REST API: Tasks ──────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title, description, status, priority, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const result = await pool.query(
      'INSERT INTO tasks (title, description, status, priority, due_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [title, description || null, status || 'pending', priority || 'medium', due_date || null]
    );
    const task = result.rows[0];
    broadcast({ type: 'TASK_CREATED', task });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { title, description, status, priority, due_date } = req.body;
  try {
    const result = await pool.query(
      'UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4, due_date=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [title, description, status, priority, due_date, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    const task = result.rows[0];
    broadcast({ type: 'TASK_UPDATED', task });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    broadcast({ type: 'TASK_DELETED', id: parseInt(req.params.id) });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Email Routes ─────────────────────────────────────────────────────────────
const emailRoutes = require('./emailRoutes');
app.use('/api/email', emailRoutes);

app.get('/api/ws/stats', (req, res) => {
  res.json({ connected_clients: wss.clients.size });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`   REST:      http://localhost:${PORT}/api/tasks`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
