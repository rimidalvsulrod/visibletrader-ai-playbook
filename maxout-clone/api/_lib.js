// Shared server code: database, sessions, Google ID-token check, live prices from Hyperliquid.
const crypto = require('crypto');
const { Pool } = require('pg');

const START = 1000; // paper refills to this every day

/* ---------- database ---------- */
const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL ||
  Object.entries(process.env).find(([k, v]) => /(DATABASE_URL|POSTGRES_URL)$/.test(k) && /^postgres/.test(v || ''))?.[1];
let pool, ready;
function db() {
  const url = dbUrl();
  if (!url) throw httpErr(503, 'Database not connected yet');
  pool ??= new Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  ready ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS mx_users (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text, picture text,
      paper double precision NOT NULL DEFAULT ${START}, refilled text, created bigint NOT NULL)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mx_positions (id text PRIMARY KEY, uid text NOT NULL, sym text NOT NULL, side text NOT NULL,
      amount double precision NOT NULL, mult double precision NOT NULL, entry double precision NOT NULL, opened bigint NOT NULL,
      status text NOT NULL DEFAULT 'open', exit double precision, pnl double precision, closed bigint)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mx_positions_uid ON mx_positions (uid, status)`);
  })().catch(e => { ready = null; throw e; });
  return ready.then(() => pool);
}

/* ---------- http helpers ---------- */
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
function handler(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (typeof req.body === 'string') { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
      req.body ??= {};
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: status === 500 ? 'Something went wrong' : e.message });
    }
  };
}

/* ---------- sessions: signed cookie "uid.expiry.signature" ---------- */
// SESSION_SECRET if set; otherwise a key derived from the (secret) database URL, so no extra secret is needed.
const SECRET = () => process.env.SESSION_SECRET || (dbUrl() ? crypto.createHash('sha256').update('mx-session:' + dbUrl()).digest('hex') : null);
const sign = s => crypto.createHmac('sha256', SECRET()).update(s).digest('base64url');
function setSession(res, uid) {
  if (!SECRET()) throw httpErr(503, 'Database not connected yet');
  const exp = Date.now() + 30 * 864e5, v = `${uid}.${exp}`;
  res.setHeader('Set-Cookie', `mx_s=${v}.${sign(v)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${process.env.VERCEL ? '; Secure' : ''}`);
}
function clearSession(res) { res.setHeader('Set-Cookie', 'mx_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); }
function sessionUid(req) {
  if (!SECRET()) return null;
  const m = /(?:^|;\s*)mx_s=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [uid, exp, sig] = m[1].split('.');
  if (!uid || !sig || +exp < Date.now()) return null;
  const good = sign(`${uid}.${exp}`);
  return good.length === sig.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig)) ? uid : null;
}
async function requireUser(req) {
  const uid = sessionUid(req);
  if (!uid) throw httpErr(401, 'Sign in first');
  const p = await db();
  const { rows } = await p.query('SELECT * FROM mx_users WHERE id=$1', [uid]);
  if (!rows[0]) throw httpErr(401, 'Sign in first');
  return rows[0];
}

/* ---------- Google: verify the ID token the sign-in button hands us ---------- */
async function verifyGoogle(idToken) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) throw httpErr(503, 'Google sign-in is not configured');
  // local dev only (never on Vercel): "dev:you@example.com" signs in without Google
  if (process.env.MX_DEV && !process.env.VERCEL && idToken.startsWith('dev:')) { const email = idToken.slice(4); return { sub: email, email, name: email.split('@')[0], picture: null }; }
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  const t = await r.json();
  if (!r.ok || t.aud !== cid || !['accounts.google.com', 'https://accounts.google.com'].includes(t.iss) ||
      t.email_verified !== 'true' || +t.exp * 1000 < Date.now()) throw httpErr(401, 'Google sign-in failed');
  return { sub: t.sub, email: t.email, name: t.name || t.email.split('@')[0], picture: t.picture || null };
}

/* ---------- prices: Hyperliquid main dex (crypto) + "xyz" dex (US stocks) ---------- */
const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'AMZN', 'META', 'MSFT', 'GOOGL', 'COIN', 'HOOD', 'AMD', 'NFLX', 'PLTR', 'MSTR', 'INTC'];
const CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'LINK', 'ADA', 'LTC'];
let priceCache = { at: 0, px: null };
async function prices() {
  if (priceCache.px && Date.now() - priceCache.at < 2000) return priceCache.px;
  const hl = body => fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const [main, xyz] = await Promise.all([hl({ type: 'metaAndAssetCtxs' }), hl({ type: 'metaAndAssetCtxs', dex: 'xyz' })]);
  const px = {};
  for (const [meta, ctx] of [main, xyz]) meta.universe.forEach((u, i) => {
    const sym = u.name.replace(/^xyz:/, '');
    const want = u.name.startsWith('xyz:') ? STOCKS.includes(sym) : CRYPTO.includes(sym);
    if (want && +ctx[i]?.markPx) px[sym] = +ctx[i].markPx;
  });
  priceCache = { at: Date.now(), px };
  return px;
}
function stocksOpen() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = et.getDay(), h = et.getHours();
  return d > 0 && d < 6 && h >= 4 && h < 20;
}
const isStock = s => STOCKS.includes(s), isMarket = s => STOCKS.includes(s) || CRYPTO.includes(s);
const pnlOf = (p, price) => Math.max(-p.amount, p.amount * p.mult * (price / p.entry - 1) * (p.side === 'long' ? 1 : -1));
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => crypto.randomBytes(9).toString('base64url');

module.exports = { db, handler, httpErr, setSession, clearSession, sessionUid, requireUser, verifyGoogle, prices, stocksOpen, isStock, isMarket, pnlOf, today, newId, START };
