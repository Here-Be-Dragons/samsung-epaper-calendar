#!/usr/bin/env python3
"""
panel_lab.py: test the wake and device calls against a real Samsung EM32DX e-paper panel, and find out
how it behaves on its own. Python 3.8+, standard library only. Independent of the Node container, so a
result here tells you what the PANEL does, not what our code does.

Everything it knows comes from two community write-ups (fayep/Joyous and lexdoudkin/frontpage PROTOCOL.md),
not from Samsung documentation, so the point of this script is to CHECK those claims on your panel.

Settings come from flags, the environment, or a .env file in the current directory or the project root (read
automatically; no need to `source` it):
  --host / DISPLAY_HOST   --pin / DISPLAY_PIN   --mac / DISPLAY_MAC (the panel's WI-FI MAC)
  --broadcast / DISPLAY_BROADCAST (default: the panel IP's /24)   --mdc-port / DISPLAY_MDC_PORT (1515)

Commands (READ-ONLY unless marked CHANGES PANEL):
  info                   open a session (waking the panel if needed) and print everything it will tell us:
                         battery, power source, Wi-Fi MAC (checked against --mac), serial, software, name.
  scan                   READ-ONLY  ask every standard 'get' query (network standby, timers, clock, ...): which does the
                         panel answer? Shows whether it has a schedule of its own.
  battery [--log F]      wake if needed, read the battery, append it to a log, report the drain so far, and put the
                         panel back to sleep if it was asleep. Run it from cron (hourly) for a drain figure.
  wake                   send the wake packets and time how long until an MDC session works.
  standby on|off         CHANGES PANEL  set Network Standby (needed for remote wake after sleep).
  sleep [--deep]         CHANGES PANEL  put the panel to sleep (refuses without --mac unless --force). --deep turns
                         Network Standby OFF first: a Wi-Fi-off sleep that only the power button undoes.
  push URL               CHANGES PANEL  tell the panel to fetch this manifest URL (redraws it).
  serve                  run the test endpoint (manifest + test-pattern PNG) and log every request.
  test NAME              guided experiments (see below), each prints plain-English findings.

Experiments (`test NAME`); all except `session` change what the panel shows or whether it sleeps:
  session     READ-ONLY  protocol check: every info query, checksums, and (optionally) the one-connection rule.
  drain       a QUIET drain measurement (--hours 1) of one way of sleeping: mdc-sleep, content-sleep (the panel's own
              switch), or content-touched. Run on battery. One hour tells 4.6 %/h from 1.5 %/h.
  content-sleep  with the panel's own "sleep immediately after receiving content" switch ON: how soon after a
              picture does it go quiet, and can a wake packet still bring it back?
  schedule    push a TWO-picture schedule (V1 now, V2 in --flip-minutes) and watch: can the panel change pictures on
              its own, and does it wake itself to do it? (--sleep puts it to sleep first; --schedule-mode playlist)
  reach       watch the panel (default 30 min) and log when it drops off the network, and whether wake
              packets bring it back: run it after UNPLUGGING the panel to see what battery power does.
  sleep-ladder  sleep the panel, then try to wake it after 1, 5, 15, 30, 60, 120 min: how long can it sleep
              and still be woken? (about 3.5 h; run it on battery)
  wake        sleep, confirm it is asleep, wake it five ways (both packets, WoL broadcast+unicast, WoL
              broadcast only, WoL unicast only, Samsung's only): which wake it and how long each takes.
  push        serve the test pattern, push it, and time the panel's two downloads (manifest, then image).
  same-id     push the same manifest again, then the same picture under a new name: which one re-downloads?
  poll        push, change the file at the SAME url without pushing, and watch: does an awake panel
              ever come back and look by itself?
  wake-fetch  push, sleep the panel, change the file, wake it WITHOUT pushing: does it look on waking?
  passive     sleep the panel and just serve the endpoint for hours: does it ever wake and fetch alone?

Test pattern: six color bars, then the version, a timestamp and the content ID in large digits, so a glance at
the panel shows exactly which version it is displaying.
"""
import argparse
import hashlib
import http.server
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
import zlib
from datetime import datetime, timezone

SUB_BATTERY, SUB_WIFI_MAC = 0x73, 0x81
POWER_SOURCES = {1: 'ac', 2: 'usb', 3: 'wireless'}
# Read-only information commands: (name, command, data). Replies are shown raw; NAK is reported, not fatal.
INFO_QUERIES = [
    ('serial number', 0x0B, b''),
    ('software version', 0x0E, b''),
    ('device name', 0x67, b''),
]
# Not asked: model number (0x8A) is refused (NAK) by the EM32DX, as are power and status.


def now():
    return datetime.now().strftime('%H:%M:%S')


def say(msg=''):
    print(f'[{now()}] {msg}', flush=True)


def hexs(b):
    return bytes(b).hex(' ')


# --- MDC session -------------------------------------------------------------------------------------------

class MdcError(Exception):
    """kind: timeout | unreachable (probably asleep), refused, auth, nak, closed, protocol"""

    def __init__(self, kind, message, payload=b''):
        super().__init__(message)
        self.kind, self.payload = kind, payload


def build_frame(cmd, data=b''):
    body = bytes([cmd, 0, len(data)]) + bytes(data)
    return b'\xaa' + body + bytes([sum(body) & 0xFF])


class Session:
    def __init__(self, sock, host, port):
        self.sock, self.host, self.port = sock, host, port

    def _recv_exact(self, n, deadline):
        out = b''
        while len(out) < n:
            left = deadline - time.time()
            if left <= 0:
                raise MdcError('timeout', 'no reply from the panel')
            self.sock.settimeout(left)
            try:
                chunk = self.sock.recv(n - len(out))
            except socket.timeout:
                raise MdcError('timeout', 'no reply from the panel')
            except (ssl.SSLError, OSError) as e:
                raise MdcError('closed', f'connection lost: {e}')
            if not chunk:
                raise MdcError('closed', 'the panel closed the connection')
            out += chunk
        return out

    def read_frame(self, deadline):
        """One response frame: AA FF id len ack cmd payload... checksum (len counts ack+cmd+payload)."""
        while self._recv_exact(1, deadline) != b'\xaa':  # resynchronize on a header byte
            pass
        head = self._recv_exact(3, deadline)
        length = head[2]
        body = self._recv_exact(length + 1, deadline)
        raw = b'\xaa' + head + body
        checksum_ok = (sum(raw[1:-1]) & 0xFF) == raw[-1]
        return {
            'ack': chr(body[0]) if length >= 1 else '?', 'cmd': body[1] if length >= 2 else None,
            'payload': body[2:length], 'checksum_ok': checksum_ok, 'raw': raw, 'is_response': head[0] == 0xFF,
        }

    def command(self, cmd, data=b'', timeout=8.0, expect_reply=True):
        try:
            self.sock.settimeout(timeout)
            self.sock.sendall(build_frame(cmd, data))
        except (ssl.SSLError, OSError) as e:
            raise MdcError('closed', f'connection lost while sending: {e}')
        if not expect_reply:
            try:
                return self.read_frame(time.time() + timeout)
            except MdcError:
                return None  # a panel going to sleep drops the connection instead of answering
        deadline = time.time() + timeout
        while True:
            f = self.read_frame(deadline)
            if f['cmd'] == cmd:
                break
        if not f['checksum_ok']:
            raise MdcError('protocol', f'checksum mismatch in the reply to 0x{cmd:02x}', f['payload'])
        if f['ack'] == 'N':
            raise MdcError('nak', f'the panel refused command 0x{cmd:02x} (NAK)', f['payload'])
        return f

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def open_session(host, port, pin, timeout=6.0):
    """Connect, read the banner, upgrade to TLS, send the PIN. The connect IS the session: never 'probe'."""
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
    except socket.timeout:
        raise MdcError('timeout', f'no connection to {host}:{port} within {timeout:g} s (the panel is probably asleep)')
    except ConnectionRefusedError:
        raise MdcError('refused', f'{host}:{port} refused the connection (another device may hold the panel IP)')
    except OSError as e:
        raise MdcError('unreachable', f'{host}:{port}: {e}')
    try:
        sock.settimeout(timeout)
        banner = b''
        while b'MDCSTART<<TLS>>' not in banner:
            chunk = sock.recv(64)
            if not chunk:
                raise MdcError('closed', 'closed before the banner')
            banner += chunk
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            ctx.set_ciphers('ALL:@SECLEVEL=0')  # the panel's TLS is old and self-signed
        except ssl.SSLError:
            pass
        tls = ctx.wrap_socket(sock)
        tls.sendall(pin.encode())
        reply = b''
        while b'MDCAUTH<<' not in reply:
            chunk = tls.recv(64)
            if not chunk:
                raise MdcError('closed', 'closed during authentication')
            reply += chunk
    except socket.timeout:
        sock.close()
        raise MdcError('timeout', f'{host}:{port} accepted the connection but never started MDC within {timeout:g} s')
    except (ssl.SSLError, OSError) as e:
        sock.close()
        raise MdcError('closed', f'TLS/auth failed: {e}')
    except MdcError:
        sock.close()
        raise
    if b'MDCAUTH<<PASS>>' not in reply:
        tls.close()
        raise MdcError('auth', 'authentication failed: ' + ('blocked after too many wrong PINs' if b'0x02' in reply else 'wrong PIN'))
    return Session(tls, host, port)


# --- Waking --------------------------------------------------------------------------------------------------

def mac_bytes(mac):
    h = ''.join(c for c in mac if c in '0123456789abcdefABCDEF')
    if len(h) != 12:
        raise SystemExit(f'"{mac}" is not a MAC address (6 bytes, like 00:11:22:33:44:55)')
    return bytes.fromhex(h)


def guess_broadcast(host):
    parts = host.split('.')
    return '.'.join(parts[:3] + ['255']) if len(parts) == 4 and all(p.isdigit() for p in parts) else None


def send_wake(mac, host, broadcast, methods=('wol', 'magic'), wol_port=9, magic_port=10194):
    """Sends the wake packets and returns a list of what was sent.
    wol:   6 x 0xFF + MAC x 16, to the subnet broadcast AND straight to the panel, UDP 9
           (wol-bcast / wol-unicast send just one of the two).
    magic: hex SHA-256 of '<MAC UPPERCASE>:E-Paper' (with and without colons) to the panel, UDP 10194."""
    sent = []
    m = mac_bytes(mac)
    up = ':'.join(f'{b:02X}' for b in m)

    def udp(payload, addr, port, bcast=False):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            if bcast:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.sendto(payload, (addr, port))
            return True
        except OSError as e:
            sent.append(f'FAILED udp {addr}:{port}: {e}')
            return False
        finally:
            s.close()

    pkt = b'\xff' * 6 + m * 16
    if ('wol' in methods or 'wol-bcast' in methods) and broadcast and udp(pkt, broadcast, wol_port, True):
        sent.append(f'WoL magic packet ({len(pkt)} bytes) -> {broadcast}:{wol_port} (broadcast)')
    if ('wol' in methods or 'wol-unicast' in methods) and udp(pkt, host, wol_port):
        sent.append(f'WoL magic packet ({len(pkt)} bytes) -> {host}:{wol_port} (unicast)')
    if 'magic' in methods:
        for text in (f'{up}:E-Paper', f'{up.replace(":", "")}:E-Paper'):
            digest = hashlib.sha256(text.encode()).hexdigest().encode()
            if udp(digest, host, magic_port):
                sent.append(f'Samsung packet sha256("{text}") -> {host}:{magic_port}')
    return sent


def connect_with_wake(a, methods=('wol', 'magic'), assume_asleep=False, wake_timeout=45.0, say_fn=say):
    """An open session, waking the panel first if it does not answer. Returns (session, seconds, woke)."""
    t0 = time.time()
    if not assume_asleep:
        try:
            return open_session(a.host, a.mdc_port, a.pin, 5.0), 0.0, False
        except MdcError as e:
            if e.kind not in ('timeout', 'unreachable', 'refused'):
                raise
            if e.kind == 'refused' and not a.mac:
                raise
            say_fn(f'no answer ({e.kind}): ' + ('the address answers but MDC is not listening: the panel may be starting up or in a deep sleep that keeps the network stack alive'
                                                 if e.kind == 'refused' else 'the panel is probably asleep'))
    if not a.mac:
        raise MdcError('timeout', 'the panel does not answer and --mac is not set, so it cannot be woken')
    for line in send_wake(a.mac, a.host, a.broadcast, methods, a.wol_port, a.magic_port):
        say_fn('  wake: ' + line)
    t_wake = time.time()
    next_resend = t_wake + 10
    time.sleep(getattr(a, 'first_wait', 1.0))
    while time.time() - t_wake < wake_timeout:
        try:
            s = open_session(a.host, a.mdc_port, a.pin, 3.0)
            return s, time.time() - t_wake, True
        except MdcError as e:
            if e.kind == 'auth':
                raise
        if time.time() >= next_resend:
            for line in send_wake(a.mac, a.host, a.broadcast, methods, a.wol_port, a.magic_port):
                say_fn('  wake (resend): ' + line)
            next_resend = time.time() + 10
        time.sleep(1)
    raise MdcError('timeout', f'the panel did not answer within {wake_timeout:g} s of waking')


# --- Device calls ------------------------------------------------------------------------------------------

def read_battery(s):
    f = s.command(0x1B, bytes([SUB_BATTERY]))
    p = f['payload']
    out = {'raw': hexs(p), 'percent': None, 'source': None}
    if len(p) >= 7 and p[0] == SUB_BATTERY:
        out['percent'] = min(100, p[4])
        out['source'] = POWER_SOURCES.get(p[6], 'battery')
    return out


def read_wifi_mac(s):
    """The reply is the sub-command byte then the MAC as ASCII hex without colons (seen on a real EM32DX:
    81 + "001122334455"). `mac` is that, formatted AA:BB:CC:DD:EE:FF."""
    p = s.command(0x1B, bytes([SUB_WIFI_MAC]))['payload']
    text = ''.join(chr(b) for b in p if 32 <= b < 127)
    digits = ''.join(c for c in text.lower() if c in '0123456789abcdef')[:12]
    mac = ':'.join(digits[i:i + 2] for i in range(0, 12, 2)).upper() if len(digits) == 12 else None
    return {'raw': hexs(p), 'text': text, 'mac': mac}


def read_info(s):
    out = {}
    for name, cmd, data in INFO_QUERIES:
        try:
            p = s.command(cmd, data)['payload']
            out[name] = {'raw': hexs(p), 'text': ''.join(chr(b) for b in p if 32 <= b < 127)}
        except MdcError as e:
            out[name] = {'error': f'{e.kind}: {e}'}
    return out


def set_standby(s, on):
    return s.command(0xB5, bytes([1 if on else 0]))


def sleep_now(s):
    s.command(0x11, b'\x00', timeout=2.5, expect_reply=False)


def push_url(s, url):
    b = url.encode()
    if len(b) > 254:
        raise SystemExit(f'the URL is {len(b)} bytes; the panel accepts at most 254')
    s.command(0xC7, bytes([0x53, 0x80, len(b)]) + b)


# --- Test content: a PNG that says which version it is ----------------------------------------------------------

INKS = [(0, 0, 0), (255, 255, 255), (255, 0, 0), (255, 255, 0), (0, 255, 0), (0, 0, 255)]
FONT = {  # 5x7 glyphs
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11110 10001 10001 10001 10001 10001 11110',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'V': '10001 10001 10001 10001 01010 01010 00100', 'L': '10000 10000 10000 10000 10000 10000 11111',
    ':': '00000 00100 00100 00000 00100 00100 00000', '-': '00000 00000 00000 11111 00000 00000 00000',
    ' ': '00000 00000 00000 00000 00000 00000 00000',
}


def make_png(width, height, version, token, stamp):
    rows = [bytearray([1]) * width for _ in range(height)]

    def rect(x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(height, y1)):
            rows[y][max(0, x0):min(width, x1)] = bytes([c]) * (min(width, x1) - max(0, x0))

    def text(s, x, y, scale, c):
        for ch in s:
            for ry, line in enumerate(FONT.get(ch, FONT[' ']).split()):
                for rx, bit in enumerate(line):
                    if bit == '1':
                        rect(x + rx * scale, y + ry * scale, x + (rx + 1) * scale, y + (ry + 1) * scale, c)
            x += 6 * scale

    bar = width // 6
    for i in range(6):
        rect(i * bar, 0, (i + 1) * bar, height // 12, i)
    y = height // 12 + 60
    text(f'V{version}', 80, y, 40, 0)
    text(stamp, 80, y + 360, 28, 5)
    text(token[-16:], 80, y + 700, 14, 2)
    text('LAB', 80, y + 900, 20, 0)
    for i in range(0, width, 80):  # a checker band: shows dithering or scaling problems at a glance
        rect(i, height - 400, i + 40, height - 340, 0)
    rect(0, height - 200, width, height - 190, 0)

    def chunk(kind, data):
        return len(data).to_bytes(4, 'big') + kind + data + (zlib.crc32(kind + data) & 0xFFFFFFFF).to_bytes(4, 'big')

    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    plte = b''.join(bytes(c) for c in INKS)
    ihdr = width.to_bytes(4, 'big') + height.to_bytes(4, 'big') + bytes([8, 3, 0, 0, 0])
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'PLTE', plte) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


class Content:
    """What the endpoint serves. A new version means a new picture and a new content ID (file name)."""

    def __init__(self, base_url, width, height):
        self.base, self.width, self.height = base_url, width, height
        self.lock = threading.Lock()
        self.images = {}   # token -> png bytes
        self.version = 0
        self.token = None
        self.manifest = b''
        self.raw = None   # a hand-built manifest (the schedule tests) that replaces the generated one
        self.set_version(1)

    def set_version(self, version, nonce=''):
        stamp = datetime.now().strftime('%H:%M:%S')
        token = f'LAB-{hashlib.sha256(f"{version}{stamp}".encode()).hexdigest()[:16].upper()}{nonce}'
        png = make_png(self.width, self.height, version, token, stamp)
        self.republish(version, token, png)

    def rename(self, nonce):
        """The same picture under a new content ID (file name)."""
        with self.lock:
            png = self.images[self.token]
            version = self.version
        self.republish(version, f'LAB-{hashlib.sha256(png).hexdigest()[:16].upper()}-{nonce}', png)

    def republish(self, version, token, png):
        name = f'{token}.png'
        manifest = {
            'schedule': [{'start_date': '1970-01-01', 'stop_date': '2999-12-31', 'start_time': '00:00:00', 'contents': [{
                'image_url': f'{self.base}/image/{name}', 'file_id': token,
                'file_path': f'/home/owner/content/Downloads/vxtplayer/epaper/mobile/contents/{token}/{name}',
                'duration': 91326, 'file_size': str(len(png)), 'file_name': name}]}],
            'name': 'panel-lab', 'version': 1, 'create_time': datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M:%S'), 'id': token,
            'program_id': 'com.samsung.ios.ePaper', 'content_type': 'ImageContent', 'deploy_type': 'MOBILE',
        }
        text = json.dumps(manifest).replace('/', '\\/')  # the panel's parser wants escaped slashes
        with self.lock:
            self.images[token] = png
            self.version, self.token, self.manifest = version, token, text.encode()

    def set_raw(self, manifest_bytes):
        with self.lock:
            self.raw = manifest_bytes

    def current(self):
        with self.lock:
            return self.version, self.token, (self.raw or self.manifest)


class Log:
    def __init__(self, path=None):
        self.lock = threading.Lock()
        self.events = []
        self.file = open(path, 'a') if path else None

    def add(self, **e):
        e['t'] = time.time()
        with self.lock:
            self.events.append(e)
            if self.file:
                self.file.write(json.dumps({**e, 'iso': datetime.fromtimestamp(e['t']).isoformat()}) + '\n')
                self.file.flush()
        say(f'  HTTP {e["client"]} {e["method"]} {e["path"]} -> {e["status"]} ({e["bytes"]} bytes) {e["ua"]}')

    def since(self, t0, kind=None, client=None, ok_only=False):
        with self.lock:
            return [e for e in self.events if e['t'] >= t0 and (kind is None or e['kind'] == kind)
                    and (client is None or e['client'] == client) and (not ok_only or e['status'] == 200)]


def start_server(content, log, port):
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *args):
            pass

        def _serve(self, head):
            version, token, manifest = content.current()
            path = self.path.split('?')[0]
            kind, body, ctype = 'other', None, 'text/plain'
            if path in ('/content.json', '/manifest.json'):
                kind, body, ctype = 'manifest', manifest, 'application/json'
            elif path.startswith('/image/') and path.endswith('.png'):
                name = path[len('/image/'):-4]
                with content.lock:
                    body = content.images.get(name)
                kind, ctype = 'image', 'image/png'
            status = 200 if body is not None else 404
            body = body if body is not None else b'not found'
            self.send_response(status)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if not head:
                self.wfile.write(body)
            log.add(kind=kind, client=self.client_address[0], method=self.command, path=self.path, status=status,
                    bytes=len(body), ua=self.headers.get('User-Agent', '-'), version=version if kind != 'other' else None,
                    token=path.split('/')[-1][:-4] if kind == 'image' else None)

        def do_GET(self):
            self._serve(False)

        def do_HEAD(self):
            self._serve(True)

    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# --- Helpers for the experiments --------------------------------------------------------------------------------------

def local_ip_for(host):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((host, 9))
        return s.getsockname()[0]
    finally:
        s.close()


def pick_lan_address(detected, panel_host, interface_text):
    """The address the panel should be told to fetch from. `detected` is what the routing table says this machine would use to
    reach the panel; if that is not on the panel's /24 (a VPN or office address, which the panel cannot reach), look for this
    machine's address on the panel's network among the interfaces. Returns (address, note)."""
    prefix = '.'.join(panel_host.split('.')[:3]) + '.'
    if detected.startswith(prefix):
        return detected, ''
    for m in re.finditer(r'inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)', interface_text or ''):
        if m.group(1).startswith(prefix):
            return m.group(1), (f'note: the route to the panel starts from {detected}, an address the panel cannot reach (a VPN or another network); '
                                f"using {m.group(1)}, this machine's address on the panel's network")
    return detected, (f'WARNING: this machine\'s address toward the panel is {detected}, which is not on the panel\'s network ({prefix}x), and no interface '
                      f'has an address there. The panel will not be able to fetch pictures from here: run this from a machine on the panel\'s network, '
                      f'or give --public-host the address the panel can reach.')


def interface_listing():
    for cmd in (['ifconfig'], ['ip', '-4', 'addr']):
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
        except (OSError, subprocess.SubprocessError):
            continue
    return ''


def confirm(a, what):
    if a.yes:
        return
    print(f'\nThis CHANGES THE PANEL: {what}')
    if input('Type YES to continue: ').strip() != 'YES':
        raise SystemExit('Cancelled.')


def wait_for(log, t0, kind, timeout, token=None, client=None):
    """Seconds after t0 of the first SUCCESSFUL matching request (from `client`, if given), or None."""
    end = time.time() + timeout
    while time.time() < end:
        for e in log.since(t0, kind, client=client, ok_only=True):
            if token is None or e.get('token') == token:
                return e['t'] - t0
        time.sleep(0.2)
    return None


def watch(log, t0, minutes, label):
    """Waits, printing a dot a minute, and returns every request seen."""
    end = time.time() + minutes * 60
    say(f'Watching for {minutes:g} min ({label}). Ctrl-C ends the wait early.')
    try:
        while time.time() < end:
            time.sleep(min(30, max(0.1, end - time.time())))
            say(f'  ... {int((end - time.time()) / 60 + 0.99)} min left, {len(log.since(t0))} request(s) so far')
    except KeyboardInterrupt:
        say('  (wait ended early)')
    return log.since(t0)


def finding(title, text):
    print(f'\n  FINDING: {title}\n    {text}', flush=True)


def session_for(a, **kw):
    s, secs, woke = connect_with_wake(a, **kw)
    say(f'Session open ({"woke the panel in %.1f s" % secs if woke else "the panel was awake"}).')
    return s


def show_battery(s, label=''):
    try:
        b = read_battery(s)
        say(f'Battery{label}: {b["percent"]}% on {b["source"]}   (raw {b["raw"]})')
        return b
    except MdcError as e:
        say(f'Battery read failed: {e}')
        return None


def push_and_wait(a, content, log, push_note='', fetch_timeout=90.0, assume_asleep=False):
    """Push the current content and time the panel's two downloads. Returns (manifest_s, image_s)."""
    s = session_for(a, assume_asleep=assume_asleep)
    show_battery(s)
    version, token, _ = content.current()
    t0 = time.time()
    push_url(s, f'{content.base}/content.json')
    s.close()
    say(f'Pushed {content.base}/content.json (version {version}, ID {token}) {push_note}')
    m = wait_for(log, t0, 'manifest', fetch_timeout)
    i = wait_for(log, t0, 'image', fetch_timeout, token=token)
    say(f'Panel fetched the manifest {"after %.1f s" % m if m is not None else "NEVER"}, '
        f'and the image {"after %.1f s" % i if i is not None else "NEVER"}.')
    return m, i


# --- Commands --------------------------------------------------------------------------------------------------------

def cmd_info(a):
    s = session_for(a)
    out = {'host': a.host, 'battery': None, 'wifi_mac': None, 'info': {}}
    try:
        out['battery'] = read_battery(s)
    except MdcError as e:
        out['battery'] = {'error': str(e)}
    try:
        out['wifi_mac'] = read_wifi_mac(s)
    except MdcError as e:
        out['wifi_mac'] = {'error': str(e)}
    out['info'] = read_info(s)
    s.close()
    if a.json:
        print(json.dumps(out, indent=2))
        return
    b = out['battery']
    print('\n  Battery        :', b if 'error' in b else f'{b["percent"]}%   power source: {b["source"]}   raw: {b["raw"]}')
    w = out['wifi_mac']
    if 'error' in w:
        print('  Wi-Fi MAC reply:', w)
    else:
        mine = ':'.join(f'{x:02X}' for x in mac_bytes(a.mac)) if a.mac else None
        verdict = 'no --mac given to compare' if not mine else ('MATCHES --mac' if mine == w['mac'] else f'DOES NOT MATCH --mac {mine}: wake packets would not reach this panel')
        print(f'  Wi-Fi MAC      : {w["mac"] or "(unreadable)"}   {verdict}   raw: {w["raw"]}')
    for name, v in out['info'].items():
        print(f'  {name:<15}:', v['error'] if 'error' in v else f'"{v["text"]}"   raw: {v["raw"]}')
    print('\n  Battery layout: 73, two bytes (00 00), one byte (seen: 01), percent, one byte (seen: 02), power source.')
    print('  Confirmed on a real panel: 73 00 00 01 64 02 02 = 100% on USB, and 73 00 00 01 64 02 00 = 100% on battery.')
    print('  (The two unidentified bytes did not change between USB and battery. 01 ac / 03 wireless are from the write-ups.)')


def cmd_battery(a):
    """Wake if needed, read the battery, optionally log it, report the drain so far, and let the panel sleep."""
    s, secs, woke = connect_with_wake(a)
    say(f'Session open ({"woke the panel in %.1f s" % secs if woke else "the panel was awake"}).')
    b = read_battery(s)
    say(f'Battery: {b["percent"]}% on {b["source"]}   (raw {b["raw"]})' + (f'   [{a.label}]' if a.label else ''))
    sample = {'t': time.time(), 'iso': datetime.now().isoformat(timespec='seconds'), 'percent': b['percent'], 'source': b['source'], 'woke': woke, 'label': a.label}
    history = []
    if a.log and os.path.exists(a.log):
        with open(a.log) as f:
            history = [json.loads(line) for line in f if line.strip()]
    if a.log:
        with open(a.log, 'a') as f:
            f.write(json.dumps(sample) + '\n')
    run = [h for h in history + [sample] if h['source'] == 'battery' and h['percent'] is not None]
    # Only the latest stretch on battery counts (a charge in between starts a new one).
    for i in range(len(run) - 1, 0, -1):
        if run[i]['percent'] > run[i - 1]['percent'] + 1:
            run = run[i:]
            break
    if len(run) >= 2 and run[-1]['t'] - run[0]['t'] >= 1800:
        hours = (run[-1]['t'] - run[0]['t']) / 3600
        drop = run[0]['percent'] - run[-1]['percent']
        if drop > 0:
            rate = drop / hours
            say(f'Drain: {drop}% in {hours:.1f} h = {rate:.2f} %/hour = {rate * 24:.2f} %/day (readings are whole percents: between {max(0, drop - 1) / hours:.2f} and {(drop + 1) / hours:.2f} %/hour). At that rate {run[-1]["percent"]}% lasts about {run[-1]["percent"] / (rate * 24):.1f} days more.')
        else:
            say(f'No drop yet in {hours:.1f} h (the reading is whole percents: it needs a longer run).')
    elif a.log:
        say(f'{len(run)} sample(s) on battery so far: the drain shows after two samples at least 30 min apart.')
    if a.keep_awake:
        say('Leaving the panel awake (--keep-awake).')
    elif (woke or a.sleep) and a.mac:
        try:
            set_standby(s, True)
            sleep_now(s)
            say('Network Standby ON accepted; the panel was put back to sleep.')
        except MdcError as e:
            say(f'Not sleeping the panel: {e}')
    elif woke or a.sleep:
        say('Not sleeping the panel: --mac is needed to be able to wake it again.')
    s.close()


# Standard MDC "get" queries (a command with no data; command bytes from the python-samsung-mdc library). The EM32DX
# refuses some of them: that is the point of the scan. The timer and clock ones show whether the panel has a schedule
# of its own, which an "it wakes itself every hour" plan depends on. (Power, 0x11, is left out: it is the sleep
# command's byte and the EM32DX refuses the query anyway.)
SCAN = [
    ('network standby', 0xB5, b'', 'onoff'), ('standby', 0x4A, b'', 'standby'), ('auto power', 0x33, b'', 'onoff'),
    ('clock (seconds)', 0xC5, b'', 'clock'), ('clock (minutes)', 0xA7, b'', 'clock'),
    ('timer 1', 0xA4, b'', None), ('timer 2', 0xA5, b'', None), ('timer 3', 0xA6, b'', None), ('timer 4', 0xAB, b'', None),
    ('timer 5', 0xAC, b'', None), ('timer 6', 0xAD, b'', None), ('timer 7', 0xAE, b'', None),
    ('holiday count', 0xA9, b'', None), ('daylight saving', 0xB6, b'', None), ('panel on time', 0x83, b'', 'on_time'),
    ('error status', 0x0D, b'', None), ('model name', 0x8A, b'', 'text'), ('model number', 0x10, b'', None),
    ('status', 0x00, b'', None), ('launcher play via', 0xC7, b'\x81', 'mode'), ('launcher url address', 0xC7, b'\x82', 'text'),
]


def decode_scan(kind, payload):
    if kind == 'text':
        return '"' + ''.join(chr(b) for b in payload if 32 <= b < 127) + '"'
    if not payload:
        return ''
    if kind == 'onoff':
        return {0: 'OFF', 1: 'ON'}.get(payload[0], '?')
    if kind == 'standby':
        return {0: 'OFF', 1: 'ON', 2: 'AUTO'}.get(payload[0], '?')
    if kind == 'power':
        return {0: 'OFF', 1: 'ON', 2: 'REBOOT'}.get(payload[0], '?')
    if kind == 'on_time' and len(payload) >= 2:
        return f'{int.from_bytes(payload[:2], "big") * 10} min'
    if kind == 'clock' and len(payload) >= 7:  # a guess at the layout: day, hour (12 h), minute, month, year (2 bytes), flag
        return f'{payload[0]} {["?", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][min(payload[3], 12)]} {int.from_bytes(payload[4:6], "big")} {payload[1]}:{payload[2]:02d} flag {payload[6]} (guess; this machine says {datetime.now():%d %b %Y %H:%M})'
    if kind == 'mode' and len(payload) >= 2:
        return f'mode {payload[1]}'
    return ''


def cmd_scan(a):
    """Read-only: ask the panel every standard 'get' query and print which it answers and which it refuses."""
    s = session_for(a)
    answered = {}
    print()
    for name, cmd, data, kind in SCAN:
        try:
            f = s.command(cmd, data, timeout=4.0)
            p = f['payload']
            answered[name] = bytes(p).hex(' ')
            print(f'  {name:<22} 0x{cmd:02X}{(" " + data.hex()) if data else ""}  ACK   {decode_scan(kind, p):<14} raw: {hexs(p)}')
        except MdcError as e:
            print(f'  {name:<22} 0x{cmd:02X}{(" " + data.hex()) if data else ""}  {"NAK" if e.kind == "nak" else e.kind.upper():<5}')
    s.close()
    timers = [n for n in answered if n.startswith('timer')]
    clock = [n for n in answered if n.startswith('clock')]
    print()
    finding('schedule support', ('the panel answers ' + ', '.join(timers) + ': it has on/off timers. Their raw replies are above: send them to me.') if timers else
            'the panel refused every timer query: it probably has no on/off timer reachable over MDC (its own app or menu may still have a wake schedule).')
    print('  ' + ('Clock: the panel answers ' + ', '.join(clock) + ' (it keeps time, which timers need).' if clock else 'Clock: refused: no clock reachable over MDC.'))
    if 'network standby' in answered:
        print('  Network Standby is currently: ' + decode_scan('onoff', bytes.fromhex(answered['network standby'].replace(' ', ''))))


def cmd_wake(a):
    if not a.mac:
        raise SystemExit('--mac is required')
    say('Sending the wake packets. If the panel is already awake nothing visible happens.')
    t0 = time.time()
    s, secs, woke = connect_with_wake(a, assume_asleep=True)
    say(f'MDC session open {time.time() - t0:.1f} s after the first wake packet.')
    s.close()


def cmd_standby(a):
    s = session_for(a)
    on = a.state == 'on'
    try:
        set_standby(s, on)
        say(f'Network Standby {"ON" if on else "OFF"}: the panel accepted it.')
    except MdcError as e:
        say(f'The panel did NOT accept Network Standby {a.state}: {e}')
    s.close()


def cmd_sleep(a):
    if a.deep:
        say('--deep: Network Standby is turned OFF first, so the panel cannot be woken over the network afterwards. Press its power button to wake it.')
    elif not a.mac and not a.force:
        raise SystemExit('Refusing: without --mac the panel could not be woken again (--force overrides).')
    confirm(a, ('the panel goes into a DEEP sleep (Network Standby OFF): no wake packet reaches it, only its power button.' if a.deep else
                'the panel goes to sleep and needs a wake packet or its power button to come back.'))
    s = session_for(a)
    try:
        set_standby(s, not a.deep)
        say(f'Network Standby {"OFF (deep sleep)" if a.deep else "ON"} accepted.')
    except MdcError as e:
        say(f'Standby not accepted ({e}): ' + ('it may not go as deep as asked.' if a.deep else 'remote wake will probably NOT work.'))
        if not a.force and not a.deep:
            s.close()
            raise SystemExit('Not sleeping. Use --force to sleep anyway.')
    sleep_now(s)
    s.close()
    say('Sleep command sent.')


def cmd_push(a):
    confirm(a, 'the panel fetches the URL and redraws.')
    s = session_for(a)
    push_url(s, a.url)
    s.close()
    say('Pushed.')


def make_content(a):
    host = a.public_host
    if not host:
        host, note = pick_lan_address(local_ip_for(a.host), a.host, interface_listing())
        if note:
            say(note)
    return Content(f'http://{host}:{a.http_port}', a.width, a.height), host


def cmd_serve(a):
    content, host = make_content(a)
    log = Log(a.log)
    start_server(content, log, a.http_port)
    say(f'Serving http://{host}:{a.http_port}/content.json (version 1, ID {content.current()[1]}). Ctrl-C to stop.')
    if a.push:
        confirm(a, 'the panel fetches this test pattern and redraws.')
        push_and_wait(a, content, log)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


def experiment_env(a):
    content, host = make_content(a)
    log = Log(a.log)
    start_server(content, log, a.http_port)
    say(f'Test endpoint: {content.base}/content.json (the panel must be able to reach {host}:{a.http_port})')
    return content, log


def t_session(a):
    say('Test: session (read-only)')
    s = session_for(a)
    ok = True
    for name, cmd, data in [('battery', 0x1B, bytes([SUB_BATTERY])), ('wifi mac', 0x1B, bytes([SUB_WIFI_MAC]))] + INFO_QUERIES:
        try:
            f = s.command(cmd, data)
            say(f'  {name:<17} ack={f["ack"]} checksum {"OK" if f["checksum_ok"] else "BAD"}  payload {hexs(f["payload"])}')
            ok = ok and f['checksum_ok']
        except MdcError as e:
            say(f'  {name:<17} {e.kind}: {e}')
    if a.single_connection_check:
        say('Checking the one-connection rule: opening a second session while this one is open ...')
        try:
            s2 = open_session(a.host, a.mdc_port, a.pin, 4.0)
            s2.close()
            say('  The panel ACCEPTED a second session while one was open.')
            second = 'accepted'
        except MdcError as e:
            say(f'  second session: {e.kind}')
            second = e.kind
        try:
            read_battery(s)
            say('  The first session still works.')
        except MdcError as e:
            say(f'  The first session broke: {e}')
        finding('one connection at a time', f'second session was "{second}". The write-ups say the panel allows one and that a probe breaks the real command.')
    s.close()
    finding('protocol', 'every reply was well-formed and its checksum matched.' if ok else 'at least one checksum did not match: the frame layout assumed here may be wrong for your panel.')


def t_wake(a):
    if not a.mac:
        raise SystemExit('--mac is required for the wake test')
    say('Test: wake. Puts the panel to sleep several times and wakes it with different packets.')
    confirm(a, 'the panel is put to sleep and woken up to five times (if a wake fails, press its power button).')
    s = session_for(a)
    show_battery(s, ' before')
    try:
        set_standby(s, True)
        say('Network Standby ON accepted.')
    except MdcError as e:
        s.close()
        raise SystemExit(f'The panel did not accept Network Standby ({e}); the sleep/wake test would strand it. Stopping.')
    s.close()
    results = []
    variants = [('both packets', ('wol', 'magic')), ('WoL, broadcast and unicast', ('wol',)), ('WoL broadcast only', ('wol-bcast',)),
                ('WoL unicast only', ('wol-unicast',)), ('Samsung packet only', ('magic',))]
    if not a.broadcast:
        variants = [v for v in variants if v[1] != ('wol-bcast',)]
    if a.only:
        variants = [v for v in variants if a.only in v[1]]
    for label, methods in variants:
        say(f'--- {label} ---')
        s = session_for(a, assume_asleep=False)
        sleep_now(s)
        s.close()
        say(f'Sleep sent. Waiting {a.sleep_wait:g} s, then checking that the panel really sleeps ...')
        time.sleep(a.sleep_wait)
        try:
            open_session(a.host, a.mdc_port, a.pin, 4.0).close()
            say('  It still answers: it did NOT go to sleep (or it woke by itself).')
            results.append((label, 'did not sleep', None))
            continue
        except MdcError as e:
            say(f'  asleep ({e.kind}).')
        try:
            s, secs, _ = connect_with_wake(a, methods=methods, assume_asleep=True, wake_timeout=a.wake_timeout)
            say(f'  Awake: session open {secs:.1f} s after the first packet.')
            show_battery(s, ' now')
            s.close()
            results.append((label, 'woke', secs))
        except MdcError as e:
            say(f'  Did NOT wake: {e}')
            results.append((label, 'did not wake', None))
            break
    finding('what wakes it', '; '.join(f'{l}: {r}' + (f' in {t:.1f} s' if t is not None else '') for l, r, t in results)
            + '. If only one kind works, that is the one to rely on. The write-ups say about 4 s.')
    print('  Note: a UNICAST packet needs the sleeping panel\'s address in this machine\'s ARP cache, which a recent session leaves there.')
    print('  Repeat the unicast variant after a longer wait (--sleep-wait 300 --only wol-unicast) before trusting it.')


def t_push(a):
    say('Test: push')
    confirm(a, 'the panel fetches a test pattern and redraws.')
    content, log = experiment_env(a)
    m, i = push_and_wait(a, content, log)
    finding('push path', ('the panel fetched the manifest and then the image: pushing works.' if i is not None else
            'the panel did not fetch the image. Check that it can reach this machine on the HTTP port, and the PIN/URL.')
            + ' The panel should now show the test pattern with V1 and the time.')
    print('  Look at the panel: when did the picture actually change on screen? (E-paper takes ~20 s after the download.)')


def t_same_id(a):
    say('Test: same-id')
    confirm(a, 'the panel is pushed several times and may redraw.')
    content, log = experiment_env(a)
    push_and_wait(a, content, log)
    time.sleep(a.settle)
    say('--- pushing the SAME manifest again (same content ID) ---')
    t0 = time.time()
    s = session_for(a)
    push_url(s, f'{content.base}/content.json')
    s.close()
    m = wait_for(log, t0, 'manifest', 45)
    i = wait_for(log, t0, 'image', 45)
    finding('same ID', f'manifest re-fetched: {"yes" if m is not None else "no"}; image re-fetched: {"yes" if i is not None else "no"}. '
            'Expected: the manifest yes (it has to read the ID), the image no (the panel skips a file it already has).')
    time.sleep(a.settle)
    say('--- the SAME picture under a NEW content ID ---')
    content.rename(datetime.now().strftime('%H%M%S'))
    t0 = time.time()
    s = session_for(a)
    push_url(s, f'{content.base}/content.json')
    s.close()
    m = wait_for(log, t0, 'manifest', 45)
    i = wait_for(log, t0, 'image', 45)
    finding('new ID', f'manifest: {"yes" if m is not None else "no"}; image: {"yes" if i is not None else "no"}. '
            'If the image is fetched here but not above, the content ID (file name) is what makes the panel download.')


def summarize_requests(reqs, since, what):
    manifests = [e for e in reqs if e['kind'] == 'manifest']
    images = [e for e in reqs if e['kind'] == 'image']
    lines = [f'{len(manifests)} manifest request(s)' + (' at ' + ', '.join(f'+{e["t"] - since:.0f}s' for e in manifests) if manifests else ''),
             f'{len(images)} image request(s)' + (' at ' + ', '.join(f'+{e["t"] - since:.0f}s (v{e.get("version")})' for e in images) if images else '')]
    return f'{what}: ' + '; '.join(lines)


def t_poll(a):
    say('Test: poll. Does an AWAKE panel come back for a changed file on its own?')
    confirm(a, 'the panel is pushed once; then only the file we serve changes.')
    content, log = experiment_env(a)
    m, i = push_and_wait(a, content, log)
    if i is None:
        raise SystemExit('The push itself failed, so this test cannot say anything. Run `test push` first.')
    time.sleep(a.settle)
    content.set_version(2)
    t0 = time.time()
    say(f'Changed the file at the SAME URL to version 2 (ID {content.current()[1]}). NOT pushing. Watching ...')
    reqs = watch(log, t0, a.minutes, 'no pushes; version 2 is waiting at the same URL')
    got_v2 = any(e['kind'] == 'image' and e.get('version') == 2 for e in reqs)
    finding('self-polling', summarize_requests(reqs, t0, f'in {a.minutes:g} min') + '. ' + (
        'The panel looked at the endpoint by itself' + (' and downloaded version 2.' if got_v2 else ' but did not download version 2.') if reqs else
        'The panel made NO requests: while awake it does not poll in this window. Try a longer --minutes, and `test passive` for a sleeping panel.'))
    print('  (Check the panel: still V1 means it did not pick the change up.)')


def t_wake_fetch(a):
    if not a.mac:
        raise SystemExit('--mac is required')
    say('Test: wake-fetch. Does a panel that wakes look at the endpoint without being told?')
    confirm(a, 'the panel is pushed, put to sleep, then woken without a push.')
    content, log = experiment_env(a)
    m, i = push_and_wait(a, content, log)
    if i is None:
        raise SystemExit('The push itself failed, so this test cannot say anything. Run `test push` first.')
    time.sleep(a.settle)
    s = session_for(a)
    try:
        set_standby(s, True)
    except MdcError as e:
        s.close()
        raise SystemExit(f'Network Standby was refused ({e}); stopping before a sleep that could not be undone.')
    content.set_version(2)
    sleep_now(s)
    s.close()
    say(f'Panel put to sleep; the file at the same URL is now version 2. Waiting {a.sleep_wait:g} s ...')
    time.sleep(a.sleep_wait)
    t0 = time.time()
    for line in send_wake(a.mac, a.host, a.broadcast, ('wol', 'magic'), a.wol_port, a.magic_port):
        say('  wake: ' + line)
    say(f'Woken. NOT opening an MDC session (that could itself trigger a fetch). Watching {a.watch_seconds:g} s ...')
    time.sleep(a.watch_seconds)
    reqs = log.since(t0)
    got_v2 = any(e['kind'] == 'image' and e.get('version') == 2 for e in reqs)
    finding('fetch on wake', summarize_requests(reqs, t0, f'in {a.watch_seconds:g} s after waking') + '. ' + (
        'It downloaded version 2 by itself: serving the endpoint is enough once it wakes.' if got_v2 else
        'It did NOT download version 2 on waking: you must push (MDC) after waking.'))
    s, secs, woke = connect_with_wake(a, assume_asleep=False, wake_timeout=a.wake_timeout)
    say('Session open now; panel is awake.')
    show_battery(s)
    s.close()


def t_passive(a):
    say(f'Test: passive. Serve the endpoint for {a.hours:g} h while the panel sleeps and log everything.')
    confirm(a, 'the panel is pushed once, put to sleep, and left alone; a final wake reads the battery.'
            + (' WITH --standby-off it cannot be woken over the network: only its own schedule or its power button will bring it back.' if a.standby_off else ''))
    content, log = experiment_env(a)
    m, i = push_and_wait(a, content, log)
    if i is None:
        raise SystemExit('The push itself failed, so this test cannot say anything.')
    time.sleep(a.settle)
    s = session_for(a)
    start_battery = show_battery(s, ' at start')
    try:
        set_standby(s, not a.standby_off)
        say(f'Network Standby {"OFF (a deeper sleep: wake packets will not reach it)" if a.standby_off else "ON"}.')
    except MdcError as e:
        s.close()
        raise SystemExit(f'Network Standby refused ({e}); stopping.')
    sleep_now(s)
    s.close()
    t0 = time.time()
    say(f'Asleep. Logging until +{a.hours:g} h' + (f'; the file changes to version 2 at +{a.change_at:g} h.' if a.change_at else '.')
        + f' A light TCP look every {a.interval:g} s notices if the panel wakes by itself.')
    changed, last, wakes = False, 'asleep', []
    try:
        while time.time() - t0 < a.hours * 3600:
            time.sleep(max(0.05, min(a.interval, a.hours * 3600 - (time.time() - t0))))
            if a.change_at and not changed and time.time() - t0 >= a.change_at * 3600:
                content.set_version(2)
                changed = True
                say('File changed to version 2 (still no push).')
            state, _ = probe_once(a, 'tcp')
            up = state == 'listening'
            if up and last == 'asleep':
                wakes.append(time.time())
                say(f'+{(time.time() - t0) / 60:.1f} min: the panel is REACHABLE: it woke by itself (or something woke it).')
                last = 'awake'
            elif not up and last == 'awake':
                say(f'+{(time.time() - t0) / 60:.1f} min: the panel went back to sleep ({state}).')
                last = 'asleep'
    except KeyboardInterrupt:
        say('Stopped early.')
    reqs = log.since(t0)
    if wakes:
        fetched = [w for w in wakes if any(e['t'] >= w - 5 and e['t'] <= w + 120 for e in reqs)]
        woke_text = (f'It woke itself {len(wakes)} time(s) (at ' + ', '.join(f'+{(w - t0) / 60:.0f} min' for w in wakes) + ') and '
                     + (f'made requests after {len(fetched)} of them: it DOES look at the endpoint when it wakes.' if fetched else
                        'made NO request after any of them: it wakes but does not look at the endpoint, so you would still have to push.'))
    else:
        woke_text = 'It never became reachable by itself in this time: no self-wake was seen (set a wake schedule on the panel, if it has one, and repeat).'
    finding('sleeping panel', summarize_requests(reqs, t0, f'over {(time.time() - t0) / 3600:.1f} h') + '. ' + woke_text)
    try:
        s, secs, _ = connect_with_wake(a, assume_asleep=True, wake_timeout=a.wake_timeout)
        end_battery = show_battery(s, ' at end')
        s.close()
        if start_battery and end_battery and start_battery['percent'] is not None and end_battery['percent'] is not None:
            drop = start_battery['percent'] - end_battery['percent']
            hours = (time.time() - t0) / 3600
            finding('battery drain', f'{start_battery["percent"]}% -> {end_battery["percent"]}% in {hours:.1f} h with Network Standby {"OFF" if a.standby_off else "on"} '
                    f'({drop / hours * 24:.2f} %/day if the trend held). One day is too coarse: repeat over several days.')
    except MdcError as e:
        say(f'Could not wake it at the end to read the battery: {e}')


def probe_once(a, mode):
    """One look at the panel. tcp: just connect and hang up (light); session: a full MDC session with battery."""
    if mode == 'session':
        try:
            s = open_session(a.host, a.mdc_port, a.pin, 4.0)
            try:
                return 'session', read_battery(s)
            finally:
                s.close()
        except MdcError as e:
            return e.kind, None
    try:
        socket.create_connection((a.host, a.mdc_port), timeout=3).close()
        return 'listening', None
    except socket.timeout:
        return 'timeout', None
    except ConnectionRefusedError:
        return 'refused', None
    except OSError:
        return 'unreachable', None


def describe_looks(samples, t0):
    """samples: [(time, reachable)] from the TCP looks. Describes the awake windows and how often a look found the panel up."""
    if not samples:
        return 'no looks were taken'
    windows, start, last_up = [], None, None
    for t, up in samples:
        if up and start is None:
            start = t
        if up:
            last_up = t
        if not up and start is not None:
            windows.append((start, t))
            start = None
    if start is not None:
        windows.append((start, samples[-1][0]))
    up_count = sum(1 for _, up in samples if up)
    gap = (samples[-1][0] - samples[0][0]) / max(1, len(samples) - 1)
    text = f'{up_count} of {len(samples)} looks (one every ~{gap:.0f} s) found the panel up ({100 * up_count / len(samples):.0f}%)'
    if windows:
        text += '; awake at ' + ', '.join(f'+{(a - t0) / 60:.1f}-{(b - t0) / 60:.1f} min' for a, b in windows[:12]) + (' ...' if len(windows) > 12 else '')
        if len(windows) >= 3:
            gaps = [(windows[i + 1][0] - windows[i][0]) / 60 for i in range(len(windows) - 1)]
            text += f'; starts {min(gaps):.1f} to {max(gaps):.1f} min apart'
    return text


def t_reach(a):
    say(f'Test: reach. Watches the panel for {a.minutes:g} min and reports when it drops off the network and whether wake packets bring it back.')
    say('Start it with the panel AWAKE, then unplug the USB cable if you want to see what battery power does.')
    say(f'Probe: {a.probe} every {a.interval:g} s' + (f'; a wake attempt after every {a.wake_every:g} min unreachable.' if a.wake_every else '; no wake attempts.'))
    if a.probe == 'session':
        say('  (A full session each time may itself keep the panel awake and hide its idle timeout: prefer --probe tcp.)')
    t0 = time.time()
    last, first_up, first_down, last_beat = None, None, None, 0
    last_wake, wakes, samples = time.time(), [], []
    up_since, up_is_lower_bound, awake_for = None, False, []   # when it last became reachable
    reachable = lambda st: st in ('listening', 'session')
    try:
        while time.time() - t0 < a.minutes * 60:
            state, battery = probe_once(a, a.probe)
            samples.append((time.time(), reachable(state)))
            t = (time.time() - t0) / 60
            extra = f'  battery {battery["percent"]}% on {battery["source"]}' if battery else ''
            if state != last:
                say(f'+{t:5.1f} min: {state}{extra}')
                if reachable(state) and first_up is None:
                    first_up = t
                if reachable(state) and up_since is None:
                    up_since, up_is_lower_bound = time.time(), True   # already awake when the watch began
                if not reachable(state) and last is not None and reachable(last):
                    if first_down is None:
                        first_down = t
                    if up_since is not None:
                        awake_for.append(((time.time() - up_since) / 60, up_is_lower_bound))
                    up_since = None
                last = state
            elif t - last_beat >= 5:
                say(f'+{t:5.1f} min: still {state}{extra}')
                last_beat = t
            if not reachable(state) and a.wake_every and a.mac and time.time() - last_wake >= a.wake_every * 60:
                say('  wake attempt: ' + '; '.join(send_wake(a.mac, a.host, a.broadcast, ('wol', 'magic'), a.wol_port, a.magic_port)))
                last_wake = time.time()
                ok = False
                for _ in range(12):
                    time.sleep(2)
                    if reachable(probe_once(a, 'tcp')[0]):
                        ok = True
                        break
                wakes.append((t, ok))
                say(f'  -> {"it came back" if ok else "no answer: wake packets did not reach it"}')
                if ok:
                    last = 'listening'
                    up_since, up_is_lower_bound = time.time() - 2, False
            time.sleep(a.interval)
    except KeyboardInterrupt:
        say('Stopped early.')
    parts = []
    if first_down is not None:
        parts.append(f'it dropped off the network {first_down:.1f} min after the watch started')
    elif last is not None and not reachable(last):
        parts.append('it was not reachable at the start and never came back')
    else:
        parts.append('it stayed reachable the whole time')
    if awake_for:
        parts.append('between waking and the next drop it stayed up for ' + ', '.join(f'{"at least " if lb else ""}{m:.1f} min' for m, lb in awake_for)
                     + ': that is its idle sleep timer')
    if wakes:
        parts.append('wake attempts: ' + ', '.join(f'+{t:.0f} min {"worked" if ok else "FAILED"}' for t, ok in wakes))
    parts.append(describe_looks(samples, t0))
    finding('reachability', '; '.join(parts) + '. "refused" means the address answered but MDC did not (starting up, or a half-asleep state); "timeout" means nothing answered.')


def t_sleep_ladder(a):
    if not a.mac:
        raise SystemExit('--mac is required')
    delays = [float(x) for x in a.ladder.split(',') if x.strip()]
    total = sum(delays)
    say(f'Test: sleep-ladder. Sleeps the panel and tries to wake it after {", ".join(f"{d:g}" for d in delays)} min (about {total / 60:.1f} h in all).')
    say('Run it on BATTERY power, hands off. It finds how long the panel can sleep and still be woken by a packet.')
    confirm(a, 'the panel is put to sleep repeatedly (if a wake fails, press its power button).')
    s = session_for(a)
    show_battery(s, ' before')
    try:
        set_standby(s, True)
        say('Network Standby ON accepted.')
    except MdcError as e:
        s.close()
        raise SystemExit(f'The panel did not accept Network Standby ({e}); stopping.')
    s.close()
    results = []
    try:
        for d in delays:
            s = session_for(a)
            sleep_now(s)
            s.close()
            say(f'--- sleep command sent; waiting {d:g} min, then trying to wake it ---')
            end = time.time() + d * 60
            time.sleep(min(30, d * 60 / 2))
            try:
                open_session(a.host, a.mdc_port, a.pin, 4.0).close()
                say('  WARNING: the panel still answers 30 s after the sleep command: it is NOT asleep, so this step proves nothing.')
            except MdcError as e:
                say(f'  confirmed asleep: it no longer answers ({e.kind}).')
            while time.time() < end:
                time.sleep(min(60, max(0.05, end - time.time())))
            try:
                s, secs, _ = connect_with_wake(a, assume_asleep=True, wake_timeout=a.wake_timeout)
                say(f'  Woke {secs:.1f} s after the first packet, {d:g} min after sleeping.')
                show_battery(s, ' now')
                s.close()
                results.append((d, True))
            except MdcError as e:
                say(f'  Did NOT wake after {d:g} min: {e}')
                results.append((d, False))
                break
    except KeyboardInterrupt:
        say('Stopped early.')
    ok = [d for d, w in results if w]
    bad = [d for d, w in results if not w]
    if bad:
        before = f'after {max(ok):g} min it still woke, ' if ok else ''
        finding('how long it can sleep', f'{before}but after {bad[0]:g} min it did NOT wake: the panel goes into a deep sleep that wake packets cannot reach '
                f'somewhere between {max(ok) if ok else 0:g} and {bad[0]:g} min. Press its power button. This is the longest gap you can plan on between a sleep and the next wake.')
    elif ok:
        finding('how long it can sleep', f'it woke every time, up to {max(ok):g} min asleep. Try a longer --ladder (for example 240,480,720) to find the limit.')


def t_content_sleep(a):
    say('Test: content-sleep. Turn ON the panel\'s own "sleep immediately after receiving content" switch first.')
    say('Measures how soon after receiving a picture the panel goes quiet, and whether a wake packet still brings it back.')
    confirm(a, 'the panel fetches a test pattern and redraws, then sleeps (if it does not wake, press its power button).')
    content, log = experiment_env(a)
    before = time.time()
    m, i = push_and_wait(a, content, log)
    if i is None:
        raise SystemExit('The panel never fetched the picture, so this test cannot say anything. Run `test push` first.')
    t_fetch = log.since(before, 'image')[0]['t']
    say(f'Picture fetched. Watching up to {a.sleep_watch:g} s for the panel to go quiet (a light TCP look every 3 s) ...')
    quiet_at = None
    while time.time() < t_fetch + a.sleep_watch:
        state, _ = probe_once(a, 'tcp')
        if state != 'listening':
            quiet_at = time.time()
            break
        time.sleep(3)
    if quiet_at is None:
        finding('sleep after content', f'the panel was still answering {a.sleep_watch:g} s after it fetched the picture: the switch is off, or it waits longer '
                '(its own idle timer is 20 minutes here). Turn the switch on and repeat, or raise --sleep-watch.')
        return
    finding('sleep after content', f'the panel stopped answering {quiet_at - t_fetch:.0f} s after it fetched the picture ({"timeout" if state == "timeout" else state}).')
    time.sleep(a.sleep_wait)
    try:
        s, secs, _ = connect_with_wake(a, assume_asleep=True, wake_timeout=a.wake_timeout)
        say(f'Woke by packet {secs:.1f} s after the first packet: this sleep is still wakeable over Wi-Fi.')
        show_battery(s)
        s.close()
        finding('wakeable?', 'yes. The panel sleeps itself after content AND a packet brings it back: use DISPLAY_PANEL_SLEEPS_AFTER_CONTENT=true.')
    except MdcError as e:
        finding('wakeable?', f'NO ({e}). Its own sleep is a deeper one that wake packets cannot reach: press its power button, and turn the switch off '
                'if you need to push to it again over the network.')


def build_schedule_manifest(content, entries):
    """A manifest with several schedule entries and/or several contents per entry, in the field layout of the single-entry one.
    entries: [{start_date, stop_date, start_time, contents: [(token, duration_seconds), ...]}]"""
    schedule = []
    for e in entries:
        contents = []
        for token, duration in e['contents']:
            png = content.images[token]
            name = f'{token}.png'
            contents.append({'image_url': f'{content.base}/image/{name}', 'file_id': token,
                             'file_path': f'/home/owner/content/Downloads/vxtplayer/epaper/mobile/contents/{token}/{name}',
                             'duration': duration, 'file_size': str(len(png)), 'file_name': name})
        schedule.append({'start_date': e['start_date'], 'stop_date': e['stop_date'], 'start_time': e['start_time'], 'contents': contents})
    first = entries[0]['contents'][0][0]
    manifest = {'schedule': schedule, 'name': 'panel-lab-schedule', 'version': 1, 'create_time': datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M:%S'),
                'id': f'{first}-SCHED', 'program_id': 'com.samsung.ios.ePaper', 'content_type': 'ImageContent', 'deploy_type': 'MOBILE'}
    return json.dumps(manifest).replace('/', '\\/').encode()


def t_schedule(a):
    from datetime import timedelta
    say(f'Test: schedule ({a.schedule_mode}). Can the panel carry its own timed picture changes, with no network contact at the time?')
    say('The write-ups only ever send ONE schedule entry; the Samsung app\'s scheduler suggests the panel accepts more. This sends two pictures')
    say('in the same field layout and checks. If the layout is wrong the panel will ignore it: then it shows V1 only, or nothing new.')
    confirm(a, 'the panel is pushed a two-picture schedule and may redraw, and (with --sleep) is put to sleep before the change.')
    content, log = experiment_env(a)
    t1 = content.current()[1]
    content.set_version(2)
    t2 = content.current()[1]
    now = datetime.now(timezone.utc).replace(tzinfo=None) if a.schedule_utc else datetime.now()
    today = now.strftime('%Y-%m-%d')
    if a.schedule_mode == 'time':
        flip = now + timedelta(minutes=a.flip_minutes)
        entries = [{'start_date': today, 'stop_date': '2999-12-31', 'start_time': '00:00:00', 'contents': [(t1, 91326)]},
                   {'start_date': today, 'stop_date': '2999-12-31', 'start_time': flip.strftime('%H:%M:%S'), 'contents': [(t2, 91326)]}]
        flip_text = f'{flip:%H:%M:%S} ({"UTC" if a.schedule_utc else "this machine\'s local time"})'
        watch_s = a.flip_minutes * 60 + a.after_flip
    else:
        entries = [{'start_date': today, 'stop_date': '2999-12-31', 'start_time': '00:00:00', 'contents': [(t1, int(a.playlist_seconds)), (t2, int(a.playlist_seconds))]}]
        flip_text = f'{a.playlist_seconds:g} s after it started (each picture is set to last {a.playlist_seconds:g} s)'
        watch_s = a.playlist_seconds * 2 + a.after_flip
    content.set_raw(build_schedule_manifest(content, entries))
    t_push = time.time()
    s = session_for(a)
    show_battery(s)
    push_url(s, f'{content.base}/content.json')
    s.close()
    say(f'Pushed a schedule of {sum(len(e["contents"]) for e in entries)} pictures: V1 (ID {t1}) and V2 (ID {t2}).')
    time.sleep(min(a.fetch_wait, 60))
    got = {e.get('token') for e in log.since(t_push, 'image')}
    say(f'The panel downloaded: V1 {"yes" if t1 in got else "NO"}, V2 {"yes" if t2 in got else "NO"}.')
    finding('what it downloaded', 'both pictures: it understood the two-picture schedule and keeps both.' if {t1, t2} <= got else
            ('only V1: it read the first entry and ignored the rest (the layout may be wrong, or it fetches later pictures at their time).' if t1 in got else
             'neither: it did not accept this manifest.'))
    if a.no_watch:
        say(f'Pushed. Not watching the network (--no-watch): V1 shows now and V2 is due at {flip_text}. Looking at the panel would not disturb it,')
        say('but probing it would, so read the battery later with `battery --log FILE` instead.')
        return
    if a.sleep:
        time.sleep(a.settle)
        s = session_for(a)
        try:
            set_standby(s, True)
            sleep_now(s)
            say('The panel is asleep (Network Standby ON).')
        except MdcError as e:
            say(f'Could not put it to sleep ({e}); watching with it awake.')
        s.close()
    say(f'NOW WATCH THE PANEL: it should show V1 (big "V1") now, and V2 at {flip_text}. Watching the network for {watch_s / 60:.1f} min ...')
    start, last, transitions, samples = time.time(), None, [], []
    try:
        while time.time() - start < watch_s:
            state, _ = probe_once(a, 'tcp')
            up = state == 'listening'
            samples.append((time.time(), up))
            if up != last:
                transitions.append((time.time() - start, up))
                say(f'+{(time.time() - start) / 60:5.1f} min: the panel is {"REACHABLE" if up else "not answering"}')
                last = up
            time.sleep(a.interval)
    except KeyboardInterrupt:
        say('Stopped early.')
    say('Looks: ' + describe_looks(samples, start))
    later = [e for e in log.since(t_push + 5, 'image') if e.get('token') == t2]
    finding('on the network', ('the panel became reachable at ' + ', '.join(f'+{t / 60:.1f} min' for t, up in transitions if up) + ' (compare with the change time).') if any(up for _, up in transitions)
            else 'it never answered during the watch.')
    finding('V2 fetched at change time', 'V2 was downloaded after the push, during the watch.' if later else 'no download during the watch: any change happened from pictures it already held.')
    print('\n  The script cannot see the screen. What did the panel show at the change time: V1 or V2?')
    print('  V2 on time, while asleep and never answering = the panel can change pictures on its own schedule.')
    print('  If it stayed on V1, try --schedule-utc (the time may be read as UTC), then --schedule-mode playlist.')


def t_drain(a):
    """A short, quiet drain measurement of one way of putting the panel to sleep. One hour tells 4.6 %/h from 1.5 %/h."""
    cfg = a.config
    what = {'mdc-sleep': 'our sleep command with Network Standby ON (the state of the sleep-ladder, 1.5 %/h)',
            'content-sleep': "the panel's own \"sleep immediately after receiving content\", with nothing touching it afterwards",
            'content-touched': "the panel's own \"sleep after content\", but with one MDC session 30 s after the picture (what last night's run did)"}[cfg]
    say(f'Test: drain ({cfg}). Leaves the panel alone for {a.hours:g} h after: {what}.')
    say('Run it on BATTERY power (unplugged). Nothing probes the panel during the wait: the endpoint stays up and any request the panel makes is logged.')
    confirm(a, 'the panel is put to sleep (or pushed one picture and left to sleep itself) and then left alone.')
    content, log = experiment_env(a)
    s = session_for(a)
    start = show_battery(s, ' at start')
    if not start or start['percent'] is None:
        s.close()
        raise SystemExit('Could not read the battery.')
    if start['source'] in ('ac', 'usb', 'wireless') and not a.force:
        s.close()
        raise SystemExit(f'The panel is on {start["source"]} power: a drain measurement means nothing there. Unplug it (or --force).')
    t_read = time.time()
    if cfg == 'mdc-sleep':
        set_standby(s, True)
        sleep_now(s)
        s.close()
    else:
        t_push = time.time()
        push_url(s, f'{content.base}/content.json')
        s.close()
        if wait_for(log, t_push, 'image', 60, client=a.host) is None:
            raise SystemExit(f'The panel did not fetch the picture within 60 s of being told to, so nothing was measured (and the panel was left awake). It may still fetch later: on one run it fetched 15 minutes late. It was told to fetch from {content.base}: '
                             "is that this machine's address on the panel's network? If not, give --public-host the right one.")
        if cfg == 'content-touched':
            time.sleep(30)
            s2 = session_for(a)
            show_battery(s2, ' (the touch)')
            s2.close()
    t_quiet = time.time()
    say(f'Quiet now. Do not touch the panel. Ends at {datetime.fromtimestamp(t_quiet + a.hours * 3600):%H:%M:%S}.')
    try:
        while time.time() - t_quiet < a.hours * 3600:
            time.sleep(max(0.05, min(900, a.hours * 3600 - (time.time() - t_quiet))))
            left = a.hours * 3600 - (time.time() - t_quiet)
            if left > 1:
                say(f'  ... {int(left / 60)} min to go; the panel has made {len(log.since(t_quiet, client=a.host))} request(s) to the endpoint')
    except KeyboardInterrupt:
        say('Stopped early.')
    s, secs, woke = connect_with_wake(a)
    end = show_battery(s, ' at end')
    found = 'it was ALREADY AWAKE when we came back (no wake needed)' if not woke else f'it was asleep and woke in {secs:.1f} s'
    hours = (time.time() - t_read) / 3600
    reqs = log.since(t_quiet, client=a.host)
    if end and end['percent'] is not None:
        drop = start['percent'] - end['percent']
        rate = drop / hours
        lo, hi = max(0, drop - 1) / hours, (drop + 1) / hours   # the readings are whole percents
        how = ('about the same as being awake all the time (4.2 %/h): this is NOT a real sleep' if lo >= 3.5 else
               'a real sleep (well under the 4.2 %/h of being awake)' if hi <= 2.5 else
               'too close to call from one hour of whole-percent readings: run it longer')
        caveat = (' A battery shown as 100% can stay at 100% for a while, so an hour from a full charge tends to under-read: repeat from a lower charge or for several hours.'
                  if start['percent'] >= 99 else '')
        finding('drain', f'{start["percent"]}% -> {end["percent"]}% in {hours:.2f} h: between {lo:.1f} and {hi:.1f} %/h (best guess {rate:.2f}; the readings are whole percents): {how}. '
                f'At the end {found}. ' + (f'While left alone the panel made {len(reqs)} request(s) to the endpoint, at ' + ', '.join(f'+{(e["t"] - t_quiet) / 60:.1f} min {e["kind"]}' for e in reqs)
                + ' (a fetch it still owed, or a pull by itself: compare with when it was told to fetch).' if reqs else 'The panel made no request to the endpoint while left alone.') + caveat)
    if woke or cfg == 'mdc-sleep':
        try:
            set_standby(s, True)
            sleep_now(s)
            say('Put the panel back to sleep.')
        except MdcError:
            pass
    s.close()


TESTS = {'drain': t_drain, 'session': t_session, 'reach': t_reach, 'content-sleep': t_content_sleep, 'schedule': t_schedule, 'sleep-ladder': t_sleep_ladder, 'wake': t_wake, 'push': t_push, 'same-id': t_same_id, 'poll': t_poll, 'wake-fetch': t_wake_fetch, 'passive': t_passive}


def load_dotenv():
    """Reads DISPLAY_* (and anything else) from a .env file in the current directory or the project root, without
    overriding what is already in the environment, so the script works in any terminal without `source .env`.
    Understands KEY=VALUE, optional `export`, and single or double quotes."""
    here = os.path.dirname(os.path.abspath(__file__))
    for path in (os.path.join(os.getcwd(), '.env'), os.path.join(here, '..', '.env')):
        if not os.path.isfile(path):
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                if line.startswith('export '):
                    line = line[7:]
                key, value = line.split('=', 1)
                key, value = key.strip(), value.strip()
                if value[:1] in ('"', "'") and value.endswith(value[:1]) and len(value) >= 2:
                    value = value[1:-1]
                elif ' #' in value:
                    value = value.split(' #', 1)[0].rstrip()
                os.environ.setdefault(key, value)
        return path
    return None


def add_options(p, sub=False):
    """The options, added to the main parser and to every subcommand so they work before or after the
    command (`test poll --minutes 30` or `--minutes 30 test poll`). On a subcommand an option the user did
    not give is left unset (SUPPRESS), so it cannot overwrite one given before the command."""
    env = os.environ.get

    def dflt(value):
        return argparse.SUPPRESS if sub else value

    def flag(name, **kw):
        p.add_argument(name, action='store_true', default=dflt(False), **kw)

    p.add_argument('--host', default=dflt(env('DISPLAY_HOST')))
    p.add_argument('--pin', default=dflt(env('DISPLAY_PIN')))
    p.add_argument('--mac', default=dflt(env('DISPLAY_MAC', '')), help="the panel's Wi-Fi MAC")
    p.add_argument('--broadcast', default=dflt(env('DISPLAY_BROADCAST', '')), help="subnet broadcast address (default: the panel IP's /24)")
    p.add_argument('--mdc-port', type=int, default=dflt(int(env('DISPLAY_MDC_PORT', '1515'))))
    p.add_argument('--wol-port', type=int, default=dflt(9), help=argparse.SUPPRESS)
    p.add_argument('--magic-port', type=int, default=dflt(10194), help=argparse.SUPPRESS)
    p.add_argument('--public-host', default=dflt(None), help="this machine's LAN address as the panel sees it (default: detected)")
    p.add_argument('--http-port', type=int, default=dflt(8099), help='port of the test endpoint (default 8099)')
    p.add_argument('--width', type=int, default=dflt(1440))
    p.add_argument('--height', type=int, default=dflt(2560))
    p.add_argument('--log', default=dflt(None), help='append every HTTP request to this JSON-lines file')
    flag('--yes', help='do not ask before changing the panel')
    flag('--json', help='info: print JSON')
    flag('--force')
    p.add_argument('--wake-timeout', type=float, default=dflt(45.0))
    p.add_argument('--first-wait', type=float, default=dflt(1.0), help='seconds after the wake packets before the first connection attempt (default 1: finer timing; the write-ups wait 3)')
    p.add_argument('--sleep-wait', type=float, default=dflt(25.0), help='seconds to wait after sleep before checking (default 25)')
    p.add_argument('--settle', type=float, default=dflt(45.0), help='seconds for the e-paper to finish refreshing between steps (default 45)')
    p.add_argument('--minutes', type=float, default=dflt(30.0), help='poll: how long to watch (default 30)')
    p.add_argument('--watch-seconds', type=float, default=dflt(90.0), help='wake-fetch: how long to watch after waking (default 90)')
    p.add_argument('--hours', type=float, default=dflt(24.0), help='passive: how long to log (default 24)')
    p.add_argument('--change-at', type=float, default=dflt(0.0), help='passive: change the file after this many hours')
    flag('--single-connection-check', help='session: also test the one-connection rule')
    flag('--push', help='serve: push the test pattern at start')
    flag('--sleep', help='battery: put the panel to sleep afterwards even if it was awake')
    flag('--keep-awake', help='battery: do not put the panel back to sleep afterwards')
    flag('--deep', help='sleep: turn Network Standby OFF first (a Wi-Fi-off deep sleep that only the power button undoes)')
    p.add_argument('--label', default=dflt(''), help='battery: a note stored with the sample (for example start, morning)')
    flag('--no-watch', help='schedule: push the schedule and stop, without watching the network (for quiet, unattended runs)')
    flag('--standby-off', help='passive: turn Network Standby OFF before sleeping (a deeper sleep; only its own schedule or the power button wakes it)')
    p.add_argument('--interval', type=float, default=dflt(30.0), help='reach: seconds between looks (default 30)')
    p.add_argument('--wake-every', type=float, default=dflt(0.0), help='reach: after this many minutes unreachable, send wake packets (0 = never)')
    p.add_argument('--probe', choices=['tcp', 'session'], default=dflt('tcp'), help='reach: tcp (connect and hang up; default) or a full MDC session')
    p.add_argument('--sleep-watch', type=float, default=dflt(180.0), help='content-sleep: seconds to watch for the panel to go quiet (default 180)')
    p.add_argument('--schedule-mode', choices=['time', 'playlist'], default=dflt('time'), help='schedule: two entries with start times (time) or two pictures with durations (playlist)')
    p.add_argument('--flip-minutes', type=float, default=dflt(10.0), help='schedule: minutes until V2 is due (default 10)')
    p.add_argument('--playlist-seconds', type=float, default=dflt(180.0), help='schedule playlist: seconds each picture lasts (default 180)')
    p.add_argument('--after-flip', type=float, default=dflt(180.0), help='schedule: seconds to keep watching after the change is due (default 180)')
    p.add_argument('--fetch-wait', type=float, default=dflt(45.0), help='schedule: seconds to wait for the panel to download the pictures (default 45)')
    flag('--schedule-utc', help='schedule: write the times as UTC instead of this machine\'s local time')
    p.add_argument('--config', choices=['mdc-sleep', 'content-sleep', 'content-touched'], default=dflt('content-sleep'), help='drain: how the panel is put to sleep')
    p.add_argument('--ladder', default=dflt('1,5,15,30,60,120'), help='sleep-ladder: minutes to sleep before each wake attempt (default 1,5,15,30,60,120)')
    p.add_argument('--only', default=dflt(None), help='wake: test only this method (wol, wol-bcast, wol-unicast, magic)')


def main():
    load_dotenv()
    p = argparse.ArgumentParser(description='Test the wake and device calls of a Samsung EM32DX e-paper panel.', formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    add_options(p)
    sub = p.add_subparsers(dest='command', required=True)
    for name in ('info', 'wake', 'sleep', 'serve', 'battery', 'scan'):
        add_options(sub.add_parser(name), sub=True)
    sp = sub.add_parser('standby'); add_options(sp, sub=True); sp.add_argument('state', choices=['on', 'off'])
    sp = sub.add_parser('push'); add_options(sp, sub=True); sp.add_argument('url')
    sp = sub.add_parser('test'); add_options(sp, sub=True); sp.add_argument('name', choices=sorted(TESTS))
    a = p.parse_args()
    if not a.host or a.pin is None:
        p.error('--host and --pin are required (or DISPLAY_HOST / DISPLAY_PIN)')
    if not a.broadcast:
        a.broadcast = guess_broadcast(a.host) if not a.host.startswith('127.') else ''
    try:
        {'info': cmd_info, 'scan': cmd_scan, 'battery': cmd_battery, 'wake': cmd_wake, 'standby': cmd_standby, 'sleep': cmd_sleep, 'push': cmd_push, 'serve': cmd_serve,
         'test': lambda a: TESTS[a.name](a)}[a.command](a)
    except MdcError as e:
        say(f'FAILED: {e}')
        hints = {'auth': 'check --pin (the MDC PIN set on the panel)', 'refused': 'something else answers at that IP, or the panel is not at --host',
                 'timeout': 'if it is asleep set --mac (Wi-Fi MAC) and turn on Network Standby on the panel'}
        if e.kind in hints:
            say('  hint: ' + hints[e.kind])
        sys.exit(1)
    except KeyboardInterrupt:
        print()
        sys.exit(130)


if __name__ == '__main__':
    main()
