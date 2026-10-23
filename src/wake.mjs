/**
 * Waking a sleeping panel over Wi-Fi. The panel keeps its Wi-Fi chip listening ("Network Standby" must be
 * on in its settings, and the MAC is the panel's WI-FI MAC) and wakes in about four seconds when it
 * hears either of two packets:
 *   - a standard Wake-on-LAN magic packet (6 x 0xFF, then the MAC 16 times) on UDP 9, which Joyous
 *     sends to the subnet's broadcast address; we also send it straight to the panel
 *   - Samsung's own: the hex SHA-256 of "<MAC UPPERCASE>:E-Paper", sent to the panel's IP on UDP 10194
 *     (a unicast, so it also works from a Docker bridge network where a broadcast would not)
 * The Samsung packet's exact text is from a paraphrase of the Joyous source, so two spellings of the MAC
 * are sent (with and without colons); extra packets to a closed UDP port are harmless.
 */
import dgram from 'node:dgram';
import { createHash } from 'node:crypto';

export const WOL_PORT = 9;
export const SAMSUNG_WAKE_PORT = 10194;

const macBytes = (mac) => {
  const hex = mac.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 12) throw new Error(`"${mac}" is not a MAC address (expected 6 bytes, like 00:11:22:33:44:55)`);
  return Buffer.from(hex, 'hex');
};

export const normalizeMac = (mac) => macBytes(mac).toString('hex').toUpperCase().match(/../g).join(':');

export function wolPacket(mac) {
  const m = macBytes(mac);
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => m)]);
}

/** The Samsung wake payloads: SHA-256 hex of the uppercase MAC (with colons, then without) + ":E-Paper". */
export function samsungMagic(mac) {
  const colon = normalizeMac(mac);
  return [colon, colon.replaceAll(':', '')].map((m) => Buffer.from(createHash('sha256').update(`${m}:E-Paper`).digest('hex')));
}

/** The /24 broadcast address of an IPv4 address (assumes a /24; set DISPLAY_BROADCAST otherwise). */
export function guessBroadcast(host) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(host ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]}.255` : null;
}

function send(packet, host, port, { broadcast = false } = {}) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const done = () => { try { socket.close(); } catch { /* already closed */ } resolve(); };
    socket.once('error', done);
    socket.bind(0, () => {
      try { if (broadcast) socket.setBroadcast(true); } catch { /* not allowed here */ }
      socket.send(packet, port, host, done);
    });
  });
}

/** Sends every wake packet. Errors are swallowed: an unreachable broadcast address must not stop the rest. */
export async function sendWake({ mac, host, broadcast, ports = {} }) {
  const wolPort = ports.wol ?? WOL_PORT, magicPort = ports.magic ?? SAMSUNG_WAKE_PORT;
  const bc = broadcast || guessBroadcast(host);
  const wol = wolPacket(mac);
  const jobs = [];
  if (bc) jobs.push(send(wol, bc, wolPort, { broadcast: true }));
  if (host) {
    jobs.push(send(wol, host, wolPort));
    for (const payload of samsungMagic(mac)) jobs.push(send(payload, host, magicPort));
  }
  await Promise.all(jobs);
}
