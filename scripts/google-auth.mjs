#!/usr/bin/env node
/**
 * One-time sign-in for SHOPPING_SOURCE=googletasks: prints the Google consent URL, catches the
 * redirect on localhost, and prints the refresh token to put in .env as GOOGLE_REFRESH_TOKEN.
 *
 * Before running it, in Google Cloud Console create a project, enable the "Google Tasks API",
 * and create an OAuth client of type "Desktop app". Then:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.mjs
 * Only read access to Tasks is requested. (While the consent screen is in "Testing" mode, Google
 * expires refresh tokens after 7 days; publish it, or add yourself as a test user and re-run.)
 */
import http from 'http';

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.'); process.exit(1); }

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/tasks.readonly',
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get('code');
  if (!code) { res.end('Waiting for Google...'); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const body = await r.json();
  res.end(body.refresh_token ? 'Done. You can close this tab and return to the terminal.' : 'No refresh token came back; see the terminal.');
  if (body.refresh_token) console.log(`\nGOOGLE_REFRESH_TOKEN=${body.refresh_token}\n\nAdd that line to .env.`);
  else console.error('\nGoogle did not return a refresh token:', JSON.stringify({ ...body, access_token: body.access_token ? '(hidden)' : undefined }));
  server.close();
});
server.listen(PORT, '127.0.0.1', () => console.log(`Open this URL in a browser and approve access:\n\n${url}\n`));
