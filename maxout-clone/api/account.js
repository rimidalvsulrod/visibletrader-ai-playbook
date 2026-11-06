// The signed-in user's paper account.
// GET: balance, open positions, recent closed trades (refills to 1,000 daily and liquidates busted positions first).
// POST {op:'open', sym, side, amount, mult} | {op:'close', id} | {op:'topup', amount}
const L = require('./_lib');

async function snapshot(p, u) {
  const [open, closed] = await Promise.all([
    p.query(`SELECT * FROM mx_positions WHERE uid=$1 AND status='open' ORDER BY opened DESC`, [u.id]),
    p.query(`SELECT * FROM mx_positions WHERE uid=$1 AND status<>'open' ORDER BY closed DESC LIMIT 20`, [u.id]),
  ]);
  const { rows } = await p.query('SELECT paper FROM mx_users WHERE id=$1', [u.id]);
  return { user: { id: u.id, email: u.email, name: u.name, picture: u.picture }, paper: rows[0].paper, positions: open.rows, history: closed.rows };
}

async function closePos(p, pos, price, status) {
  const pnl = L.pnlOf(pos, price), back = Math.max(0, pos.amount + pnl);
  const r = await p.query(`UPDATE mx_positions SET status=$2, exit=$3, pnl=$4, closed=$5 WHERE id=$1 AND status='open' RETURNING id`,
    [pos.id, status, price, pnl, Date.now()]);
  if (r.rowCount) await p.query('UPDATE mx_users SET paper=paper+$2 WHERE id=$1', [pos.uid, back]);
  return { pnl, back };
}

module.exports = L.handler(async req => {
  const u = await L.requireUser(req), p = await L.db();

  // daily refill: back up to 1,000 if below it
  if (u.refilled !== L.today()) {
    await p.query('UPDATE mx_users SET paper=GREATEST(paper,$2), refilled=$3 WHERE id=$1', [u.id, L.START, L.today()]);
  }

  // liquidate anything that has lost its whole stake
  const open = (await p.query(`SELECT * FROM mx_positions WHERE uid=$1 AND status='open'`, [u.id])).rows;
  if (open.length) {
    const px = await L.prices();
    for (const pos of open) if (px[pos.sym] && L.pnlOf(pos, px[pos.sym]) <= -pos.amount) await closePos(p, pos, px[pos.sym], 'liquidated');
  }

  if (req.method === 'GET') return snapshot(p, u);
  if (req.method !== 'POST') throw L.httpErr(405, 'Method not allowed');

  const b = req.body;
  if (b.op === 'open') {
    const sym = String(b.sym || '').toUpperCase(), side = b.side, amount = Math.round(+b.amount * 100) / 100, mult = Math.round(+b.mult);
    if (!L.isMarket(sym)) throw L.httpErr(400, 'Unknown market');
    if (!['long', 'short'].includes(side)) throw L.httpErr(400, 'Pick long or short');
    if (!(amount >= 1)) throw L.httpErr(400, 'Minimum is 1');
    if (!(mult >= 1 && mult <= 1000)) throw L.httpErr(400, 'Multiplier is 1× to 1000×');
    if (L.isStock(sym) && !L.stocksOpen()) throw L.httpErr(400, 'Closed · stocks trade 4am–8pm ET');
    const px = (await L.prices())[sym];
    if (!px) throw L.httpErr(503, 'No live price right now');
    const debit = await p.query('UPDATE mx_users SET paper=paper-$2 WHERE id=$1 AND paper>=$2 RETURNING paper', [u.id, amount]);
    if (!debit.rowCount) throw L.httpErr(400, 'Not enough Paper');
    await p.query(`INSERT INTO mx_positions (id, uid, sym, side, amount, mult, entry, opened) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['p_' + L.newId(), u.id, sym, side, amount, mult, px, Date.now()]);
    return snapshot(p, u);
  }

  if (b.op === 'close') {
    const pos = (await p.query(`SELECT * FROM mx_positions WHERE id=$1 AND uid=$2 AND status='open'`, [b.id, u.id])).rows[0];
    if (!pos) throw L.httpErr(404, 'Position not found');
    const px = (await L.prices())[pos.sym];
    if (!px) throw L.httpErr(503, 'No live price right now');
    const r = await closePos(p, pos, px, 'closed');
    return { ...(await snapshot(p, u)), result: r };
  }

  if (b.op === 'topup') {
    const amount = Math.round(+b.amount);
    if (!(amount >= 1 && amount <= 100000)) throw L.httpErr(400, 'Top up 1 to 100,000');
    await p.query('UPDATE mx_users SET paper=LEAST(paper+$2, 1000000) WHERE id=$1', [u.id, amount]);
    return snapshot(p, u);
  }

  throw L.httpErr(400, 'Unknown action');
});
