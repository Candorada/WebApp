import express from 'express';
import 'dotenv/config';
const app = express();
app.use(express.json());
app.use(express.static('public'));
// Get the client
import mysql from 'mysql2/promise';
// --- Config ---
const PORT = process.env.PORT || 3000;
const env = process.env

const DATABASE_CREDENTIALS = {
  "host": process.env.DB_HOST  || '',
  "user": process.env.DB_USER  || '',
  "password": env.DB_PASSWORD  || '',
  "database": env.DB_DATABASE  || ''
}; // empty = in-memory fallback

console.log('DB:', DATABASE_CREDENTIALS);
// --- In-memory fallback (if no DB yet) ---
let mem = { pageViews: 0, writes: 0 };
// --- Optional Postgres pool ---
let pool = null;
if (DATABASE_CREDENTIALS.database) {
  pool = mysql.createPool({
    host: DATABASE_CREDENTIALS.host,
    user: DATABASE_CREDENTIALS.user,
    password: DATABASE_CREDENTIALS.password,
    database: DATABASE_CREDENTIALS.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  (async () => {
    try {
await pool.query(`
    CREATE TABLE IF NOT EXISTS pageviews (
        id INT NOT NULL AUTO_INCREMENT, 
        at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    );
`);

await pool.query(`
    CREATE TABLE IF NOT EXISTS writes (
        id INT NOT NULL AUTO_INCREMENT, 
        at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    );
`);
      console.log('DB ready');
    } catch (e) {
      console.error('DB init error:', e.message);
      pool = null; // fall back to memory if DB init fails
    }
  })();
}
// --- Count a page view on homepage load ---
app.get('/', async (_req, _res, next) => {
  try {
    if (pool) await pool.query('INSERT INTO pageviews (id) VALUES (NULL)');
    else mem.pageViews++;
  } catch {}
  next();
});
// --- Demo endpoints ---
// GET: simple dynamic read
app.get('/api/time', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
// POST: demo write (increments a counter)
app.post('/api/demo-write', async (_req, res) => {
  try {
    if (pool) {
      await pool.query('INSERT INTO writes (id) VALUES (NULL)');
      const [rows] = await pool.query('SELECT COUNT(*) AS n FROM writes');
      const total = rows[0].n;
      return res.json({ ok: true, total });
    } else {
      mem.writes++;
      return res.json({ ok: true, total: mem.writes });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
// Expose simple metrics (handy while filming)
app.get('/api/metrics', async (_req, res) => {
  try {
    if (pool) {
      const [pvRows] = await pool.query('SELECT COUNT(*) AS n FROM pageviews');
      const pv = pvRows[0].n;

      const [wrRows] = await pool.query('SELECT COUNT(*) AS n FROM writes');
      const wr = wrRows[0].n;
      res.json({ pageViews: pv, writes: wr, db: true });
    } else {
      res.json({ pageViews: mem.pageViews, writes: mem.writes, db: false });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.listen(PORT, () => console.log(`Listening on ${PORT}`));










