// Local dev server: static files + /api/* handlers, in-memory Postgres (pg-mem), and a dev-only login.
// Run: node dev/server.js  (port 5173)
process.env.MX_DEV = '1';
const http = require('http'), fs = require('fs'), path = require('path');
const { newDb } = require('pg-mem');
const mem = newDb();
mem.public.registerFunction({ name: 'greatest', args: ['float', 'float'], returns: 'float', implementation: Math.max });
mem.public.registerFunction({ name: 'least', args: ['float', 'float'], returns: 'float', implementation: Math.min });
const { Pool } = mem.adapters.createPg();
require.cache[require.resolve('pg')] = { exports: { Pool } };
process.env.DATABASE_URL = 'postgres://localhost/dev';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dev-client';

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    req.body = body ? JSON.parse(body) : {}; req.query = Object.fromEntries(url.searchParams);
    const f = path.join(root, 'api', url.pathname.slice(5) + '.js');
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'no route' });
    return require(f)(req, res);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname.startsWith('/m/') ? '/app.html' : url.pathname;
  if (!path.extname(p)) p += '.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(5173, () => console.log('dev on http://localhost:5173'));
