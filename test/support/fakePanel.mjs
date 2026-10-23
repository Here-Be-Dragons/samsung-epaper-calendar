/**
 * A fake Samsung EMDX for tests: a real MDC server (banner, TLS, PIN, framed commands) that can start
 * out "asleep" (it accepts connections but stays silent) until it hears a wake packet.
 */
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

let creds;
function credentials() {
  if (creds) return creds;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakepanel-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`, '-subj', '/CN=fake-panel', '-days', '1'], { stdio: 'ignore' });
  creds = { key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) };
  return creds;
}

const reply = (cmd, ack, payload = []) => {
  const body = [0xff, 0x00, 2 + payload.length, ack.charCodeAt(0), cmd, ...payload];
  return Buffer.from([0xaa, ...body, body.reduce((a, b) => a + b, 0) & 0xff]);
};

export class FakePanel {
  constructor({ pin = '123456', battery = 80, source = 0, nakStandby = false, asleep = false, mac = '00:11:22:33:44:55', asleepMode = 'silent' } = {}) {
    // asleepMode: 'silent' accepts connections and says nothing; 'closed' stops listening (like a real asleep panel: nothing answers).
    Object.assign(this, { pin, battery, source, nakStandby, asleep, mac, asleepMode });
    this.commands = []; this.contentUrls = []; this.wakePackets = []; this.sleeps = 0; this.active = 0;
    this.sockets = new Set();
  }

  async start() {
    const { key, cert } = credentials();
    this.server = net.createServer((socket) => {
      this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)); socket.on('error', () => {});
      if (this.asleep) return; // silent until woken: the client's connect times out
      if (this.active) return socket.destroy(); // one connection at a time
      this.active++; socket.on('close', () => { this.active--; });
      socket.write('MDCSTART<<TLS>>');
      const secure = new tls.TLSSocket(socket, { isServer: true, key, cert });
      secure.on('error', () => {});
      let authed = false, buf = Buffer.alloc(0);
      secure.on('data', (chunk) => {
        if (!authed) {
          if (chunk.toString() === this.pin) { authed = true; secure.write('MDCAUTH<<PASS>>'); } else { secure.write('MDCAUTH<<FAIL:0x01>>'); secure.end(); }
          return;
        }
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 5 && buf.length >= 5 + buf[3]) {
          const len = buf[3], cmd = buf[1], data = [...buf.subarray(4, 4 + len)];
          buf = buf.subarray(5 + len);
          this.commands.push({ cmd, data });
          if (cmd === 0x1b && data[0] === 0x73) secure.write(reply(cmd, 'A', [0x73, 0, 0, 0, this.battery, 0, this.source]));
          else if (cmd === 0x1b && data[0] === 0x81) secure.write(reply(cmd, 'A', [0x81, ...Buffer.from(this.mac.replace(/:/g, '').toLowerCase())])); // as a real panel: ASCII hex, no colons
          else if (cmd === 0xc7) { this.contentUrls.push(Buffer.from(data.slice(3, 3 + data[2])).toString()); secure.write(reply(cmd, 'A', [0x53])); }
          else if (cmd === 0xb5) secure.write(reply(cmd, this.nakStandby ? 'N' : 'A', [data[0]]));
          else if (cmd === 0x11 && data.length === 0) secure.write(reply(cmd, 'N')); // the real panel refuses the power query
          else if (cmd === 0x11) { this.sleeps++; secure.destroy(); socket.destroy(); this.setAsleep(true); }
          else secure.write(reply(cmd, 'N'));
        }
      });
    });
    await new Promise((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = this.server.address().port;
    if (this.asleep) this.setAsleep(true);
    return this;
  }

  setAsleep(v) {
    this.asleep = v;
    if (this.asleepMode !== 'closed' || !this.server) return;
    if (v && this.server.listening) this.server.close();
    if (!v && !this.server.listening) this.server.listen(this.port, '127.0.0.1');
  }

  /** Listens for wake packets on loopback; hearing a valid one wakes the panel after `afterMs`. */
  async listenForWake({ afterMs = 150 } = {}) {
    const hex = createHash('sha256').update(`${this.mac.toUpperCase()}:E-Paper`).digest('hex');
    const mk = () => dgram.createSocket('udp4');
    this.wol = mk(); this.magic = mk();
    const woken = () => setTimeout(() => { this.setAsleep(false); }, afterMs);
    this.wol.on('message', (m) => { this.wakePackets.push({ kind: 'wol', length: m.length }); if (m.length === 102 && m.subarray(0, 6).equals(Buffer.alloc(6, 0xff))) woken(); });
    this.magic.on('message', (m) => { this.wakePackets.push({ kind: 'magic', text: m.toString() }); if (m.toString() === hex) woken(); });
    await Promise.all([new Promise((r) => this.wol.bind(0, '127.0.0.1', r)), new Promise((r) => this.magic.bind(0, '127.0.0.1', r))]);
    return { wol: this.wol.address().port, magic: this.magic.address().port };
  }

  async stop() {
    for (const s of this.sockets) s.destroy();
    await new Promise((r) => this.server.close(() => r()));
    for (const u of [this.wol, this.magic]) if (u) await new Promise((r) => u.close(r));
  }
}
