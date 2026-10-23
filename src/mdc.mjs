/**
 * Samsung MDC over TLS (TCP 1515), written for a panel that sleeps. It replaces the stock library's
 * session handling, which has no timeouts: a sleeping panel could hold a connection for minutes and a
 * lost reply could hang forever.
 *
 * Protocol (from the Joyous and frontpage notes; confirmed against the library we used before):
 *   1. The panel sends the banner "MDCSTART<<TLS>>" in the clear; both sides then speak TLS (no
 *      certificate check: the panel's is self-signed).
 *   2. The client writes the PIN; the panel answers "MDCAUTH<<PASS>>" or "MDCAUTH<<FAIL:0x01|0x02>>".
 *   3. Requests:  AA cmd id len data... sum        (sum = low byte of cmd+id+len+data)
 *      Responses: AA FF id len ack cmd payload... sum    (len counts ack+cmd+payload; ack "A" or "N")
 * The panel accepts ONE connection at a time, so a session must be closed when its work is done, and
 * nothing may "probe" the port: the connect is the real session.
 */
import net from 'node:net';
import tls from 'node:tls';

/** kind: timeout | unreachable (probably asleep), refused (another device holds the IP), auth, nak, closed, protocol, asleep */
export class MdcError extends Error {
  constructor(kind, message, extra = {}) { super(message); this.name = 'MdcError'; this.kind = kind; Object.assign(this, extra); }
}

export const CMD = { SLEEP: 0x11, INFO: 0x1b, NETWORK_STANDBY: 0xb5, CONTENT: 0xc7 };
const SUB_BATTERY = 0x73, SUB_WIFI_MAC = 0x81;
const POWER_SOURCES = { 1: 'ac', 2: 'usb', 3: 'wireless' };

export function buildFrame(cmd, data = [], displayId = 0) {
  const body = [cmd, displayId, data.length, ...data];
  return Buffer.from([0xaa, ...body, body.reduce((a, b) => a + b, 0) & 0xff]);
}

/** Splits the bytes received so far into response frames; `rest` is an incomplete tail to keep. */
export function parseFrames(buffer) {
  const frames = [];
  let off = 0;
  while (buffer.length - off >= 5) {
    if (buffer[off] !== 0xaa) { off++; continue; } // resynchronize on the next header
    const len = buffer[off + 3];
    const total = 4 + len + 1;
    if (buffer.length - off < total) break;
    const f = buffer.subarray(off, off + total);
    const sum = f.subarray(1, total - 1).reduce((a, b) => a + b, 0) & 0xff;
    if (f[1] === 0xff && len >= 2) frames.push({ displayId: f[2], ack: String.fromCharCode(f[4]), cmd: f[5], payload: f.subarray(6, total - 1), valid: sum === f[total - 1] });
    off += total;
  }
  return { frames, rest: buffer.subarray(off) };
}

const UNREACHABLE = new Set(['EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'EHOSTDOWN', 'ENETDOWN']);

/** Opens an authenticated MDC session, or rejects with an MdcError within `timeoutMs`. */
export function openSession({ host, port = 1515, pin, timeoutMs = 6000 }) {
  return new Promise((resolve, reject) => {
    let settled = false, stage = 'banner', secure = null, text = '', buf = Buffer.alloc(0), closed = false;
    const waiters = new Map();
    const socket = net.connect({ host, port });
    const destroy = () => { closed = true; clearTimeout(timer); secure?.destroy(); socket.destroy(); };
    const fail = (kind, message) => {
      if (settled) return;
      settled = true; destroy();
      reject(new MdcError(kind, message));
    };
    const timer = setTimeout(() => fail('timeout', `no MDC session with ${host}:${port} within ${timeoutMs} ms (the panel is probably asleep)`), timeoutMs);

    const drop = (err) => { for (const [cmd, w] of waiters) { waiters.delete(cmd); clearTimeout(w.timer); if (w.lenient) w.resolve({ ack: null, payload: Buffer.alloc(0) }); else w.reject(err); } };
    const onClose = () => {
      if (!settled) return fail('closed', `${host}:${port} closed the connection before the session started`);
      closed = true; drop(new MdcError('closed', 'the panel closed the connection'));
    };
    socket.once('error', (err) => {
      const kind = err.code === 'ECONNREFUSED' ? 'refused' : UNREACHABLE.has(err.code) ? 'unreachable' : 'closed';
      if (settled) return drop(new MdcError(kind, err.message));
      fail(kind, kind === 'refused' ? `${host}:${port} refused the connection (another device may hold the panel's IP address)` : `${host}:${port}: ${err.message}`);
    });
    socket.once('close', onClose);

    const session = {
      host,
      command(cmd, data = [], { timeoutMs: t = 8000, lenient = false } = {}) {
        if (closed) return Promise.reject(new MdcError('closed', 'the session is closed'));
        if (waiters.has(cmd)) return Promise.reject(new MdcError('protocol', `command 0x${cmd.toString(16)} is already in flight`));
        return new Promise((res, rej) => {
          const w = { resolve: res, reject: rej, lenient, timer: setTimeout(() => { waiters.delete(cmd); if (lenient) res({ ack: null, payload: Buffer.alloc(0) }); else rej(new MdcError('timeout', `no reply to command 0x${cmd.toString(16)} within ${t} ms`)); }, t) };
          waiters.set(cmd, w);
          secure.write(buildFrame(cmd, data), (err) => { if (err) { clearTimeout(w.timer); waiters.delete(cmd); rej(new MdcError('closed', err.message)); } });
        });
      },
      close() { destroy(); },
    };

    const onSecureData = (chunk) => {
      if (stage === 'auth') {
        text += chunk.toString('latin1');
        if (text.includes('MDCAUTH<<PASS>>')) { stage = 'ready'; settled = true; clearTimeout(timer); resolve(session); }
        else if (text.includes('MDCAUTH<<FAIL:0x01>>')) fail('auth', 'authentication failed: wrong PIN');
        else if (text.includes('MDCAUTH<<FAIL:0x02>>')) fail('auth', 'authentication failed: blocked after too many wrong PINs');
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      const { frames, rest } = parseFrames(buf);
      buf = rest;
      for (const f of frames) {
        const w = waiters.get(f.cmd);
        if (!w) continue;
        waiters.delete(f.cmd); clearTimeout(w.timer);
        if (!f.valid) w.reject(new MdcError('protocol', 'checksum mismatch in the panel reply'));
        else if (f.ack === 'N') w.reject(new MdcError('nak', `the panel refused command 0x${f.cmd.toString(16)} (NAK)`, { payload: f.payload }));
        else w.resolve({ ack: f.ack, payload: f.payload });
      }
    };

    socket.on('data', function onBanner(chunk) {
      if (stage !== 'banner') return;
      if (!chunk.toString('latin1').includes('MDCSTART<<TLS>>')) return fail('protocol', `unexpected banner from ${host}:${port}`);
      stage = 'auth';
      socket.removeListener('data', onBanner);
      secure = tls.connect({ socket, rejectUnauthorized: false });
      secure.on('secureConnect', () => secure.write(Buffer.from(pin)));
      secure.on('data', onSecureData);
      secure.on('error', (err) => { if (!settled) fail('closed', err.message); else drop(new MdcError('closed', err.message)); });
    });
  });
}

/** Opens a session, retrying (for the moments after a panel finishes refreshing). */
export async function openSessionRetry(options, { attempts = 3, gapMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await openSession(options); } catch (err) { last = err; if (err.kind === 'auth' || err.kind === 'refused') throw err; if (i < attempts - 1) await sleep(gapMs); }
  }
  throw last;
}

// --- Commands ---------------------------------------------------------------------------------------------

/** Tells the panel to fetch this manifest URL (not an image URL) and show what it describes. */
export async function setContentDownload(session, url) {
  const bytes = Buffer.from(url);
  if (bytes.length > 254) throw new MdcError('protocol', `the content URL is ${bytes.length} bytes; the panel accepts at most 254. Use a shorter PUBLIC_HOST/PUBLIC_URL.`);
  await session.command(CMD.CONTENT, [0x53, 0x80, bytes.length, ...bytes]);
}

/**
 * Battery percent and power source ("" on battery, else ac | usb | wireless). `raw` is the reply in hex.
 * Confirmed on a real EM32DX: 73 00 00 01 64 02 02 is 100% on USB (the other bytes are unidentified flags).
 */
export async function getBattery(session) {
  const { payload } = await session.command(CMD.INFO, [SUB_BATTERY]);
  if (payload[0] !== SUB_BATTERY || payload.length < 7) return { percent: null, source: '', raw: payload.toString('hex') };
  return { percent: Math.min(100, payload[4]), source: POWER_SOURCES[payload[6]] ?? '', raw: payload.toString('hex') };
}

/**
 * The panel's Wi-Fi MAC. A real EM32DX answers the sub-command byte (0x81) then the MAC as ASCII hex without
 * colons ("001122334455"); `mac` is that as AA:BB:CC:DD:EE:FF, or null if it does not look like one.
 */
export async function getWifiMac(session) {
  const { payload } = await session.command(CMD.INFO, [SUB_WIFI_MAC]);
  const text = payload.toString('latin1').replace(/[^\x20-\x7e]/g, '');
  const digits = text.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 12);
  return { raw: payload.toString('hex'), text, mac: digits.length === 12 ? digits.toUpperCase().match(/../g).join(':') : null };
}

/** Network standby keeps the Wi-Fi alive while asleep; without it the panel cannot be woken remotely. */
export const setNetworkStandby = (session, on) => session.command(CMD.NETWORK_STANDBY, [on ? 1 : 0]);

/** Puts the panel to sleep. It may drop the connection instead of answering, which counts as success. */
export const sleepNow = (session) => session.command(CMD.SLEEP, [0x00], { timeoutMs: 2500, lenient: true });
