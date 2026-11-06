// Public config for the browser: the Google client ID (not a secret) and whether the backend is ready.
const { handler } = require('./_lib');
module.exports = handler(async () => ({
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  accounts: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || Object.keys(process.env).some(k => /(DATABASE_URL|POSTGRES_URL)$/.test(k))),
}));
