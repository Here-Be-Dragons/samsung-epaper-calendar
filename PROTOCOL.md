# Driving a Samsung EMDX e-paper panel over the network

Samsung does not document any of this. These notes combine community write-ups with measurements on **one EM32DX**
(Spectra 6, 2560x1440, software version string `S-RSEDWWC-1130.7`, on a home Wi-Fi network). Other EMDX sizes and
firmware may differ. Every claim is tagged by how it was established:

- **verified**: observed on the EM32DX, with the raw bytes or timings to check.
- **reported**: from a community write-up and not checked here.
- **not observed**: a write-up says it, and our panel did something else.
- **unknown**: not tested yet.

The tools that produced the measurements are in this repo: [`scripts/panel_lab.py`](scripts/panel_lab.py) (see
[docs/PANEL-LAB.md](docs/PANEL-LAB.md)) and the container itself. Please send corrections, especially from other models.

## 1. The shape of it

The panel **does not poll** (reported; consistent with every quiet hour we watched, section 7). To change its picture
you connect to it over **MDC** (Samsung's display-control protocol, TCP 1515), tell it a **manifest URL**, and it then
downloads the manifest and the image from your web server. The e-paper takes about 20 seconds to redraw. If it is
asleep you must wake it first.

```
you ──(wake packet, UDP)──────────────▶ panel      (only if it is asleep)
you ──(MDC over TLS: "fetch this URL")▶ panel
panel ──(HTTP GET manifest, then image)▶ your server
```

## 2. The MDC session (TCP 1515)

- **verified** On connect the panel sends the plain text banner `MDCSTART<<TLS>>`. Both sides then speak TLS (the
  certificate is self-signed: do not verify it). The client writes the **PIN as raw bytes** (the "MDC PIN" set on the
  panel). The panel answers `MDCAUTH<<PASS>>`, or `MDCAUTH<<FAIL:0x01>>` (wrong PIN) or `MDCAUTH<<FAIL:0x02>>` (blocked after
  too many tries).
- **verified** Request frame: `AA cmd id len data... sum`, with `id` = `00`, `len` = number of data bytes, and `sum` = low
  byte of the sum of every byte after `AA`.
- **verified** Response frame: `AA FF id len ack cmd payload... sum`, where `ack` is `41` ("A", accepted) or `4E` ("N", refused),
  `len` counts `ack` + `cmd` + payload, and `sum` is the low byte of the sum of every byte after `AA`.
- **reported / not observed** The write-ups say the panel allows only **one MDC connection at a time** and that
  merely "probing" the port makes the real command fail. On the EM32DX a second session was accepted while the first
  was open and the first kept working. Serializing your own connections is still sensible.
- **verified** Reachability has three states: a normal answer; **timeout** (nothing answers: asleep); and **refused**
  (the address answers but MDC is not listening, seen right after a power change or a button press while the panel was
  starting up). Treat refused as "not ready yet", not as "another device has this IP".

## 3. Commands

Command IDs are from the [python-samsung-mdc](https://github.com/vgavro/samsung-mdc) library. A "get" is a command with no data.

| Command | Bytes | On the EM32DX |
|---|---|---|
| Fetch content | `C7` data `53 80 <len> <url>` | **verified.** The URL points at a manifest (not an image) and may be at most **254 bytes**. A wrong target fails silently (reported). |
| Battery | `1B` data `73` | **verified.** Reply payload `73 00 00 01 PP 02 SS`: `PP` = percent, `SS` = power source (`00` battery, `02` USB; `01` AC and `03` wireless are reported). Bytes 4 and 6 (`01`, `02`) did not change between USB and battery. |
| Wi-Fi MAC | `1B` data `81` | **verified.** Payload `81` followed by 12 ASCII hex characters, lower case, no colons. |
| Serial number | `0B` | **verified.** ASCII string. |
| Software version | `0E` | **verified.** ASCII string (`S-RSEDWWC-1130.7` here). |
| Device name | `67` | **verified.** ASCII string (`EM32DX-` plus four characters). |
| Network standby | `B5` (get) / `B5 01`, `B5 00` | **verified.** Get returns `01` when on. Setting it was accepted. The write-ups say **it must be on for the panel to be woken after it sleeps**; we always kept it on (the panel's one Wi-Fi-off state, section 5, could not be woken). |
| Sleep | `11 00` | **verified.** The panel stops answering within about 25 s; it may drop the connection instead of replying. |
| Clock | `A7` (get) | **verified.** Payload `DD HH MM MO YY YY FF`: day, hour, minute, month, year (two bytes), flag. It matched local time (our reading: hour on a 12-hour clock, flag `00` as PM; the flag's meaning is a guess). The panel keeps correct local time. |
| Model number | `10` | answered (`02 7A 01`). |
| Daylight saving | `B6` | answered. |
| Launcher "play via" | `C7` data `81` | **verified.** Payload `81 04`: mode 4, "app-managed content", as the write-ups say. |
| Launcher URL | `C7` data `82` | **verified.** Returns the **last manifest URL the panel was given**, as text. The panel remembers it. |
| Refused (NAK) | `4A` standby, `33` auto power, `C5` clock (seconds), `A4 A5 A6 AB AC AD AE` (all seven on/off timers), `A9` holidays, `83` panel on-time, `0D` error status, `8A` model name, `00` status | **verified** (the power "get", `11` with no data, is also refused: reported). So there is **no wake schedule you can set over MDC**. |

## 4. Content delivery

### The manifest

The panel fetches a JSON manifest, then the image it names. The schema was reverse-engineered by others (reported) and works
as follows (**verified** with PNG):

```json
{
  "schedule": [{
    "start_date": "1970-01-01", "stop_date": "2999-12-31", "start_time": "00:00:00",
    "contents": [{
      "image_url": "http://192.168.1.20:8080/api/display-content/<id>/image",
      "file_id": "<token>",
      "file_path": "/home/owner/content/Downloads/vxtplayer/epaper/mobile/contents/<token>/<token>.png",
      "duration": 91326,
      "file_size": "11280",
      "file_name": "<token>.png"
    }]
  }],
  "name": "my-display", "version": 1, "create_time": "2026-04-05 12:00:00", "id": "<token>",
  "program_id": "com.samsung.ios.ePaper", "content_type": "ImageContent", "deploy_type": "MOBILE"
}
```

Rules (reported, and consistent with what we saw):

- **Escape every `/` as `\/`** in the serialized JSON, or the panel's parser rejects it. `file_size` must be a **string**.
- **`file_name` (and `id` / `file_id`) must change** for the panel to take a new picture; a reused name is silently ignored.
  Derive the token from a hash of the image bytes: an identical picture is then never "new", and a nonce forces a redraw.
- `duration` is `91326` in both reference projects (a constant of unknown meaning).
- The panel accepts **PNG** (verified) and JPEG (reported).
- The panel sends **no User-Agent** header (verified).

### When it fetches

- **verified** With the panel awake, or asleep for a few minutes and just woken, it downloads the manifest and then the image
  **within about a second** of the MDC command.
- **verified, once** After hours asleep, a woken panel accepted the command but fetched only **15 minutes later** (manifest,
  image, manifest again). So "the command was accepted" is not "the picture arrived": wait for the panel's own download of the
  image URL, and treat a late fetch as normal.
- **verified** A request from anything other than the panel (a browser, a scanner) must not count as delivery.

### Several pictures in one push

**verified** A manifest with **two `schedule` entries** (the first with `start_time` `00:00:00`, the second ten minutes in the future) was
accepted: the panel downloaded **both images at push time**, showed the first, and later showed the second without further
instructions. The Samsung app's scheduler (timed pictures sent with the photos) works this way. **unknown:** whether the
change happened at the scheduled minute rather than early; whether the panel wakes itself to do it (the network showed it
reachable on and off every few minutes during that test, cause unknown); a "playlist" of several `contents` in one entry.

## 5. Waking and sleeping

- **verified** The standard **Wake-on-LAN** magic packet (6 x `FF`, then the **Wi-Fi** MAC 16 times, UDP port 9) wakes a sleeping
  panel: MDC answers **1.4 to 2.3 seconds** later (8 s once, just after a button press). Network standby must be on.
  Sent to the **subnet broadcast address** alone it works; sent as a **unicast to the panel's IP** alone it also works, including
  after a 5-minute sleep (from a sender whose ARP entry may still have been warm). A broadcast does not leave a Docker bridge
  network; a unicast does.
- **not observed** The write-ups also describe a packet that is the hex SHA-256 of `<MAC UPPERCASE>:E-Paper` sent to the panel on
  UDP 10194. Sent **alone it never woke the panel** (45 s with resends, twice, on USB and on battery).
- **verified** After the sleep command (network standby on) the panel was woken by packet after 1, 5, 15, 30, 60 and 120 minutes,
  and after about 4 hours. Wake before pushing; do not probe the port to find out whether it is awake.
- **verified** The panel **goes to sleep by itself** a fixed time after waking: 20 minutes, which is a setting on the panel
  ("sleep after 20 minutes"). Six cycles over two hours dropped off the network 20 minutes (plus seconds) after each wake, and a
  packet brought it back every time. There is also a switch, "sleep immediately after receiving content": with it on the panel
  went quiet **76 s** after fetching a picture on one run and within 36 s on another, and was still wakeable.
- **verified (twice)** **Unplugging the USB power sent the panel into a deep sleep** that no wake packet reached; only its power
  button woke it. A power glitch on a PoE+ install may do the same.

## 6. Power

Measured on the EM32DX, on battery, with readings in whole percents (so each figure has a range):

| State | Drain |
|---|---|
| Awake, Wi-Fi up | about **4 %/h** (100% to 91% in 2.2 h) |
| Asleep with network standby (sleep command) | **1.5 to 2 %/h** (1.55 over 3.9 h; 1 to 3 over one quiet hour) |
| Asleep via the panel's own sleep-after-content switch | **1.2 to 4 %/h** (one quiet hour 2 to 4, another 1.7 h at 1.2 to 2.3) |
| Wi-Fi-off deep sleep | **unknown** (the overnight run that might have measured it did not) |

- A charge therefore lasts about **2 days** asleep with network standby, about a day awake. Months on battery is not reachable
  while the panel keeps its Wi-Fi up for remote wake.
- **unexplained** One overnight run (10.1 h, panel left alone) fell **4.66 %/h** and found the panel awake in the morning. Not
  reproduced in later quiet hours. Another client contacting the panel (an old server pushing on a timer) is the likeliest cause.
- Samsung's figures are "200 days if the content changes once a day" and "up to 500 days" of image hold; the conditions are
  stated inconsistently (one dealer page ties the 500 days to network standby off; a datasheet to changes every three days).
  Those conditions match what we measured: the Wi-Fi is the cost.
- **Powering it permanently:** the datasheet lists a power-only USB-C port, a separate USB-C 2.0 data port, a 25 W adapter, and "RJ45 to
  USB type-C PoE+ dongle compatible (not included)". No Samsung part number for the dongle was found. Active 802.3at splitters with a
  USB-C Power Delivery output (5/9/12/15/20 V, 25 to 30 W) exist from other vendors; none names the EMDX. Match the voltage the
  supplied adapter negotiates, and use a PoE+ port.
- The panel is not documented to run without its battery installed (its LED table has a "charger connected, battery not installed" state).

## 7. Does it check for updates by itself?

- **verified (quiet runs)** In about three hours of one-hour "leave it alone" runs, with the web server up the whole time, the panel
  made **no request** except the one fetch it still owed from a push. No periodic polling was seen.
- **unknown** The dedicated experiments (`test poll`, `test wake-fetch`, `test passive` in the lab script) were **not run on
  hardware**. Until they are, treat the panel as **push-only**: wake it and send the command every time the picture changes.
- The panel stores the last manifest URL (section 3), so a pull or retry design is conceivable; a retry of a failed fetch is the
  only version of it we may have seen.

## 8. Pictures

- The panel has **six inks** (black, white, red, yellow, green, blue) and converts anything else by its own dithering, which the
  write-ups say smears small text. Its real inks are duller than the nominal colors.
- The server can send exact inks only (`TEXT_AA=threshold` or `dither`, `ART_DITHER=pattern` or `diffusion`: a PNG of exactly six
  colors, which the panel displays correctly, **verified**), or true color for the panel's own dithering to resolve. **reported**
  (one panel, by eye) that sending text with true antialiasing (`TEXT_AA=panel`, the default) looked best, better than a hard
  threshold or a server-made halftone, so the panel's dithering does not visibly smear small text. **reported** (same panel, by
  eye) that the theme art also looked better dithered by the panel (`ART_DITHER=panel`, the default) than mixed by the server.

## 9. Still open

1. The `poll`, `wake-fetch` and `passive` experiments (section 7).
2. Whether timed pictures change at the scheduled time while the panel is asleep, and what wakes it.
3. The Wi-Fi-off deep-sleep drain, and any way other than the button to wake it.
4. What a brief power loss does to a panel on PoE+, and whether the panel runs without its battery.
5. Waking after sleeps longer than about 4 hours, and the cause of the unexplained overnight drain.
6. Other models (EM13DX, EM32DX-A) and firmware.

## Sources

- [fayep/Joyous](https://github.com/fayep/Joyous): a hub for e-ink frames, including the EM32DX (wake sequence, MDC commands, manifest).
- [lexdoudkin/frontpage, PROTOCOL.md](https://github.com/lexdoudkin/frontpage/blob/main/PROTOCOL.md): field notes on driving the EM32DX.
- [taylorRichie/node-samsung-emdx](https://github.com/taylorRichie/node-samsung-emdx): the push-delivery convention this project follows.
- [vgavro/samsung-mdc](https://github.com/vgavro/samsung-mdc): MDC command IDs.
- Samsung EMDX datasheets and reseller listings for the power and battery claims.
