# Testing your own panel: `scripts/panel_lab.py`

One Python 3.8+ file, standard library only (nothing to install). It is independent of the Node server, so what it shows is
what **the panel** does. Its assumptions come from two community write-ups
([Joyous](https://github.com/fayep/Joyous), [frontpage PROTOCOL.md](https://github.com/lexdoudkin/frontpage/blob/main/PROTOCOL.md)),
not from Samsung, so its job is to check them on your hardware. What it found on one EM32DX is in
**[PROTOCOL.md](../PROTOCOL.md)**; your panel or firmware may differ, and a result from another unit is a useful contribution.

## Setup

Run it from a machine on the panel's network. The panel must be able to reach this machine on the test endpoint's port
(`--http-port`, default 8099), at an address **on the panel's own network**. The script picks this machine's address on the
panel's /24 and says so. If your machine is on a VPN it could otherwise pick the VPN address, which the panel cannot reach
(the symptom is "the panel never fetched the picture"). Name it yourself with `--public-host 192.168.1.x`
(`ipconfig getifaddr en0` shows a Mac's Wi-Fi address).

Settings come from flags, the environment, or a `.env` file in the current directory or the project root, which the script
reads itself:

| Setting | Flag | Meaning |
|---|---|---|
| `DISPLAY_HOST` | `--host` | the panel's IP address (give it a DHCP reservation) |
| `DISPLAY_PIN` | `--pin` | the panel's MDC PIN |
| `DISPLAY_MAC` | `--mac` | the panel's **Wi-Fi** MAC, needed to wake it (`info` reads it from the panel) |

```bash
python3 scripts/panel_lab.py info
```

If you `source .env` yourself, a value containing a space must be quoted or the shell reads the second word as a command.
The script's own reader and the server are fine either way.

Options can go before or after the command. Everything that changes the panel (a redraw, a sleep) asks you to type `YES`
first; `--yes` skips that. `info`, `scan`, `wake` (when the panel is already awake) and `test session` change nothing.

## Commands

| Command | Changes the panel? | What it gives you |
|---|---|---|
| `info` (`--json`) | no | Battery %, power source, the Wi-Fi MAC (compared with `--mac`), serial, software version, device name. The **raw bytes** of every reply are printed so a wrong reading can be checked. Queries the panel refuses (NAK) are reported, not fatal. |
| `battery [--log FILE] [--sleep]` | only a re-sleep | Wake if needed, read the battery, append it to a log, print the drain so far (%/hour, %/day, days left), and put the panel back to sleep if it had been asleep. Run it from cron to measure drain over days, for example `0 */6 * * * cd /path && python3 scripts/panel_lab.py battery --log drain.jsonl`. Each run keeps the panel awake for about a minute, so checking far more often mostly measures the checks. |
| `scan` | no | Asks every standard "get" query the MDC library knows: Network Standby, standby, auto power, clock, the on/off timers, holidays, daylight saving, on-time, errors, model, launcher. Which are answered and which are refused shows whether the panel exposes a schedule of its own. Raw replies are printed so they can be decoded. |
| `wake` | no | Sends the wake packets and times how long until an MDC session opens. |
| `standby on` / `off` | yes | Network Standby, which the panel needs in order to be woken after it sleeps. |
| `sleep` (`--deep`) | yes | Sleep now. Refuses without `--mac` (it could not be woken) and without Network Standby accepted. `--deep` turns Network Standby off first, so only the power button wakes it. |
| `push URL` | yes (redraws) | Sends the content-download command for a manifest URL. |
| `serve` (`--push`) | only with `--push` | Runs the test endpoint (a manifest and a test-pattern PNG) and logs every request the panel makes. |
| `test NAME` | see below | The guided experiments. |

The test pattern is six color bars, then the **version**, a **timestamp** and the **content ID** in large digits, so a glance
at the panel shows exactly which file it is displaying. `--log FILE` appends every request to a JSON-lines file.

## The experiments, in the order to run them

| # | Command | Answers | Panel |
|---|---|---|---|
| 1 | `info` | Do the battery, power-source and MAC readings look right? (Compare the raw bytes with the panel's own battery display.) | untouched |
| 2 | `test session --single-connection-check` | Are replies well formed with matching checksums? Does a second connection break the first? | untouched |
| 3 | `standby on` | Does the panel accept Network Standby? (Without it, remote wake cannot work.) | setting |
| 4 | `test push` | Does the push path work, and how long after the command does it fetch the manifest and image? | redraws |
| 5 | `test wake` | Does it sleep? Do both wake packets work, or only one, and how many seconds does each take? | sleeps 3x |
| 5b | `test reach --minutes 120 --wake-every 10` | Does an awake panel on battery go to sleep by itself when left alone, and after how long? Do wake packets bring it back? | untouched |
| 5c | `test sleep-ladder` (about 3.5 h) | How long can it sleep and still be woken? (1, 5, 15, 30, 60, 120 min) | sleeps repeatedly |
| 5d | `test content-sleep` | With the panel's own "sleep immediately after receiving content" switch ON: how many seconds after a picture does it go quiet, and does a packet still wake it? | redraws |
| 5e | `test schedule` (`--sleep`, `--schedule-utc`, `--schedule-mode playlist`) | Can the panel change pictures on its own schedule while asleep, and does it wake itself to do it? Needs a look at the panel at the change time. | redraws, sleeps |
| 6 | `test same-id` | Is a repeated manifest ignored? Does a new content ID make it download again? | redraws |
| 7 | `test poll --minutes 30` | If the file at the same URL changes and nothing is pushed, does an awake panel ever come back and look? | redraws once |
| 8 | `test wake-fetch` | If the panel sleeps and is woken without a push, does it look at the endpoint? | sleeps once |
| 9 | `test passive --hours 24` (`--change-at 12`) | Does a sleeping panel ever wake on its own schedule and fetch? Also gives its drain with Network Standby on. | sleeps for the run |
| 10 | `test drain --config ...` | The battery drain of a quiet sleep (below). | sleeps for the run |

`test reach` watches with a light TCP look every 30 s; if you suspect the looks themselves keep the panel awake, run it with
`--interval 300`. Tests 7 to 9 decide whether the panel ever checks for updates on its own, so run 7 longer
(`--minutes 120`) before trusting "it never polls", and run 9 overnight.

## Reading the findings

| Finding | What it means for the server |
|---|---|
| `test push`: image fetched | Pushing works; the HTTP port and URL are reachable from the panel. |
| `test push`: never fetched | The panel cannot reach the test endpoint: check `--public-host`, the port and any firewall. |
| `test wake`: both woke | Keep both packets (the server sends both). |
| `test wake`: only one woke | Report which one (see [PROTOCOL.md](../PROTOCOL.md) section 5 for what we saw). |
| `test wake`: did not sleep | The sleep command does nothing on this panel: do not rely on `DISPLAY_SLEEP_AFTER_PUSH`. |
| `test wake`: did not wake | Network Standby is off or the MAC is wrong. Press the panel's power button. |
| `test reach`: dropped off after N min | The panel sleeps by itself after about N idle minutes: the server need not sleep it, only wake it. |
| `test reach`: wake attempt FAILED | Wake packets cannot reach it in that state (deep sleep). The attempt before it is the longest idle you can plan on. |
| `test sleep-ladder`: did NOT wake after N min | A sleep longer than N minutes can end in a deep sleep that only the power button undoes: keep updates more frequent, or do not sleep it. |
| `test same-id`: image not re-fetched | A reused file name is skipped: the server's content-hash IDs are right, and a forced redraw needs a new name. |
| `test poll`: NO requests | An awake panel does not check on its own: **you must push**. |
| `test poll`: requests, v2 downloaded | The panel polls: serving a changed file would be enough while it is awake. |
| `test wake-fetch`: did NOT fetch | After waking, **push explicitly**. This is what the server does. |
| `test wake-fetch`: fetched v2 | Waking alone is enough: the server could wake and skip the push. |
| `test passive`: never fetched | A sleeping panel never wakes to check: nothing to schedule on the panel side. |

## Measuring battery drain (`test drain`)

`test drain` leaves the panel completely alone for `--hours` (default 1) after putting it to sleep one of three ways, then
reads the battery and says whether it found the panel **already awake** or asleep. The endpoint stays up and logs any request
the panel makes by itself. It refuses to run on USB or AC power.

| `--config` | Puts the panel to sleep by | Tells you |
|---|---|---|
| `mdc-sleep` | our sleep command with Network Standby ON | the drain of a sleep the server controls |
| `content-sleep` | the panel's own "sleep immediately after receiving content", nothing touching it afterwards | whether that switch gives a real sleep |
| `content-touched` | the same, plus one MDC session shortly after the picture | whether touching it in that window keeps it awake |

```bash
python3 scripts/panel_lab.py test drain --config content-sleep --hours 1
python3 scripts/panel_lab.py test drain --config mdc-sleep --hours 1
python3 scripts/panel_lab.py test drain --config content-touched --hours 1
```

Charge the panel first (a flat battery ends the experiments), unplug it, and run them one after another. Each test asks you to
type `YES`, so pasting three commands at once does not work (the next line is read as the answer); use `--yes`, or run all
three with `caffeinate -i scripts/drain-suite.sh` (`HOURS=2` for longer; results are also kept in `drain-suite.log`).

Battery readings are whole percents, so a one-hour test has a range, not a point: a fall from 90 to 88 is "1 to 3 %/h". A full
battery also holds 100 % for a while, so start from below about 95 %. Several hours give a tighter figure.

If an overnight result is far worse than the short tests, suspect something else on the network contacting the panel (a connection
attempt can wake it, and its idle timer then keeps it awake). The panel remembers the last manifest URL it was told to fetch
(`scan` shows it), so an old server that still pushes to its address is a candidate.

## Measuring the Wi-Fi-off deep sleep

The only state that could last for months is the Wi-Fi-off deep sleep the panel falls into when unplugged. Measure it
deliberately, with nothing running that depends on your computer staying awake, and with any other server that pushes to this
panel stopped:

```bash
python3 scripts/panel_lab.py battery --log deep.jsonl --label start --keep-awake
python3 scripts/panel_lab.py sleep --deep --yes          # Network Standby OFF, then sleep
# leave it overnight; nothing can wake it over the network
# in the morning, press the power button on the back, wait a minute, then:
python3 scripts/panel_lab.py battery --log deep.jsonl --label morning --keep-awake
python3 scripts/panel_lab.py test push --yes             # right after a long sleep: fetched at once, or late?
```

Ten hours gives a drain figure good to about 0.1 %/h. Remember that the only known way out of that state is the power button.
