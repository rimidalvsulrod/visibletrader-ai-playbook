// POST {credential}: sign in with a Google ID token. GET: who am I. DELETE: sign out.
const { db, handler, httpErr, setSession, clearSession, sessionUid, verifyGoogle, newId, START, today } = require('./_lib');

module.exports = handler(async (req, res) => {
  if (req.method === 'DELETE') { clearSession(res); return { ok: true }; }

  if (req.method === 'POST') {
    const cred = req.body.credential;
    if (!cred || typeof cred !== 'string') throw httpErr(400, 'Missing credential');
    const g = await verifyGoogle(cred);
    const p = await db();
    const { rows } = await p.query(
      `INSERT INTO mx_users (id, email, name, picture, paper, refilled, created) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, picture=EXCLUDED.picture RETURNING id, email, name, picture`,
      ['u_' + newId(), g.email.toLowerCase(), g.name, g.picture, START, today(), Date.now()]);
    setSession(res, rows[0].id);
    return { user: rows[0] };
  }

  const uid = sessionUid(req);
  if (!uid) return { user: null };
  const p = await db();
  const { rows } = await p.query('SELECT id, email, name, picture FROM mx_users WHERE id=$1', [uid]);
  return { user: rows[0] || null };
});
