# Configuration

Settings are environment variables, normally in a `.env` file (copy `.env.example`; `.env` is git-ignored because
it holds the panel PIN and API tokens). The two lists that grow and shrink, **calendars** and **displays**, can
instead live in a config file (`config/config.yaml`, see [Calendars](#calendars)). This page is the reference. For what was
learned about the panel itself, see [PROTOCOL.md](../PROTOCOL.md); for the diagnostic tools, [PANEL-LAB.md](PANEL-LAB.md).

## What the picture shows

- **Header:** today's full date on one line, and a legend of your calendars with their colors.
- **Month grid (Sunday first):** each event is just its title. All-day and multi-day events are
  colored bars that run across the days, carry on into the next week with ◂ ▸ arrows, and stack in
  lanes when they overlap. Timed events are the title in black beside a thin bar in the calendar's color, filling the free rows
  of the day. Anything that does not fit becomes "+N more". Today has a yellow band across its date and a heavy black frame.
- **Today's agenda:** time, title, then whichever of these the event has: **Where** (location),
  **Video** (Meet, Zoom, Teams link), **With** (organizer and guests, leaving you out), **Notes**
  (the description, with HTML, links and invite boilerplate stripped), and **Status**
  when tentative; the colored bar at the left shows which calendar it is from. Below it, **Coming up** lists the next days that have anything on. Nothing on the
  picture depends on the time of day: an event that has ended stays until midnight, so the picture only
  changes when the calendar changes or the date turns.
- **Shopping list** beside the agenda, if you set one up: open items only, with a count.

## Layouts

Pick one with `LAYOUT` (or `DISPLAY_<ID>_LAYOUT`, or the **Layout** selector in Home Assistant).
`/preview?layout=<name>` shows either without touching the panel.

| Layout | What it is |
|---|---|
| `paper` (default) | A printed wall calendar: colored weekday band, boxed days, red Sundays and holidays, then today's agenda and the shopping list. |
| `poster` | A holiday takeover: a full-bleed illustrated scene with a big greeting and only today's agenda on a plaque at the bottom. It replaces the chosen layout on the holiday itself (see [Holiday posters](#holiday-posters)), and you can pick it as a layout to see one: `/preview?layout=poster&now=2026-10-31T12:00:00Z`. |
| `timeline` | A compact month (shorter rows: all-day bars first, then as many timed titles as fit, then a colored dot for each one that does not), then today hour by hour (blocks sized by duration, overlaps side by side) beside Coming up and the shopping list. See below for long and crowded days. |

**A long or crowded day in the timeline.** The hour-by-hour view stays readable in four ways:
- A timed event as long as `TIMELINE_AMBIENT_HOURS` (default 24: a whole day, such as a 24/7 gym) is shown as an all-day chip above the hours, like Google Calendar does. It does not stretch the hours or take lane width. A long event shorter than that stays a block.
- Overlapping events cascade, as in Google Calendar, instead of splitting the width into equal columns: each event lies over the earlier ones with a thin white border, reaches the right edge, and starts a little to the right of the event it overlaps. If it begins within that event's title it starts just past the end of the title, so it never covers text; if it begins below the title it covers more of the event. Titles are clipped where the next event begins.
- The timeline always shows your normal day, `TIMELINE_DAY_START` to `TIMELINE_DAY_END` (default 7 AM to 9 PM), and widens only if an event falls outside it, so a day with one event is not squeezed into a few hours.
- A run of `TIMELINE_BREAK_HOURS` (default 3) or more empty hours between two events is folded into one thin break row (`1 PM - 6 PM`), so the busy parts of the day keep their height. Empty hours at the start and end of the normal day are never folded. An hour is empty if no event overlaps it.
- If the hours still cannot be drawn legibly (an hour would be under about 54 px, or more than six events overlap at once), today is listed in time order instead, with every event on its own line (squeezed to fit; "+N more" only past about two dozen).

Set either setting to 0 to turn it off; with both at 0 the day is always drawn as hours. An event that ends exactly at midnight runs to the end of the day.

Red day numbers mark Sundays, and the days of any calendar with `mark_days: true` (`CALENDAR_<ID>_MARK_DAYS=true`;
use it for a holidays calendar).

## Themes

A theme dresses the frame around the calendar, in full color: a **scenic banner** behind the date (sky
gradient, scattered pattern, rolling ground, big and small motifs), a **scenic footer** that holds the
calendar legend, a **colored weekday band and panel headers** with a motif, and a **tinted, decorated
background on real holiday dates** (a pastel Easter Sunday with a bunny, a Christmas Day tree). The date is
centered on the banner with a white outline, and the legend sits on a white plate. **The calendar boxes stay white**, and event text, bars and gridlines stay in the
panel's six pure inks so they read cleanly.

Theme colors are not limited to the six inks: the art is full color, and the six inks are mixed into each color by
dithering, by the panel by default or by the server if you choose (see "How the picture is made"). Only the core components (text, lines, bars,
highlights) are in the pure inks. Up close it reads as a pattern, so judge the look on the panel, not on screen.

**Which theme when.** A month wears its own design, and a holiday theme replaces it only around the holiday:

| Month | Design | | Month | Design |
|---|---|---|---|---|
| January | `january` (snow, snowmen) | | July | `summer` (sun, waves) |
| February | `february` (frosty pink and lavender) | | August | `august` (late-summer gold) |
| March | `march` (green hills, rainbows) | | September | `school` (apples, pencils) |
| April | `april` (rain-washed spring) | | October | `autumn` (leaves, pumpkins) |
| May | `spring` (flowers, butterflies) | | November | `november` (brown leaves, acorns) |
| June | `june` (sunny meadow) | | December | `december` (snowy night, stars) |

| Holiday window (every year) | Theme |
|---|---|
| Feb 7 to 14 | `valentine` (hearts, flowers) |
| Mar 10 to 17 | `shamrock` (St. Patrick's) |
| the week before Easter to the day after | `easter` (eggs, bunnies) |
| Jun 28 to Jul 5 | `patriotic` (stars, fireworks) |
| Oct 24 to 31 | `halloween` (pumpkins, ghosts, bats) |
| the Sunday before Thanksgiving to Thanksgiving | `autumn` |
| Dec 12 to 26 | `christmas` (trees, candy canes, gifts) |

The other built-in theme is `winter`. A holiday's own decorated cell (the bunny on Easter Sunday, a tree on Christmas Day) appears
in whatever design that month wears.

- `THEME=auto` (the default) follows the date as above. `THEME=none` turns theming off. `THEME=easter` (any theme
  name) uses one theme all year.
- Per display: `DISPLAY_<ID>_THEME`. In Home Assistant the **Theme** selector (auto, none, or a name) overrides
  everything until you set it back to auto; **Active theme** shows what is drawn now.
- `/preview?theme=easter&now=2026-04-05T12:00:00Z` shows any theme on any date without touching the panel.

### Your own themes and schedule

The `themes:` section of the config file sets all of it. Everything is optional:

```yaml
themes:
  months:                        # which design each month wears: a theme name, or none (no theme at all that month)
    oct: october-night
  windows:                       # your holiday windows, every year; the first match wins, yours before the built-in ones
    - { from: easter-7, to: easter+1, theme: easter }   # MM-DD, or easter / thanksgiving with an offset in days
    - { from: 10-24, to: 10-31, theme: halloween }
  builtin_windows: true          # false: only your windows
  marks:                         # a decorated day cell on a date, every year, in any theme
    "05-14": { motif: star, tint: "#fff3c4", deco: ["#f5b700"] }
  takeovers:                     # holiday posters, see "Holiday posters" below; yours come before the built-in ones
    - { from: 06-14, scene: birthday, greeting: [HAPPY, BIRTHDAY] }   # picture: themes/birthday/poster.png
  builtin_takeovers: true        # false: only your takeovers
  custom:                        # your own themes
    october-night:
      extends: halloween         # start from a built-in or earlier custom theme (optional)
      chrome: "#3b2a5a"          # weekday band and panel titles (dark, as white text sits on it)
      sky: ["#1b1033", "#4a2d7a"]                       # banner and footer gradient, top to bottom
      pattern: { kind: stars, colors: ["#ffffff", "#ffd93d"], size: 6, density: 1200 }
      ground: { kind: hills, colors: ["#2a1a40", "#1c1030"], height: 0.3 }
      motifs: [pumpkin, ghost, bat, moon]               # the large pictures in the header; [bat, 2] picks a variant
      holidays:
        "10-31": { motif: pumpkin, tint: "#ffe0b0", deco: ["#ff8a1f"] }
```

| Key of a custom theme | Meaning |
|---|---|
| `extends` | a theme to start from; anything you do not set comes from it |
| `chrome` | one dark color, for the weekday band, panel titles and the line under the banner |
| `sky` | two colors, the banner and footer gradient from top to bottom |
| `pattern` | `kind` (`dots`, `confetti`, `snow`, `stars`, `hearts`, `leaves`, `clover`, `lines`), `colors`, `size`, `density` (pixels² per shape: smaller is busier); `null` for none |
| `ground` | `kind` (`hills`, `snow`, `waves`, `stripes`), `colors`, `height` (a fraction of the banner); `null` for none |
| `motifs` | the pictures along the header and footer: names from the list in [themes/README.md](../themes/README.md), each optionally `[name, variant]` |
| `holidays` | decorated day cells for this theme: a date (`MM-DD`, `easter+0`, `thanksgiving`) mapped to `motif`, `tint`, `deco` (a few speckle colors) and optional `speckle: stars` |

**What a theme's colors change, and what they do not.** The colors cover the scenery: the weekday and panel-title color, the banner and
footer gradient, the scattered pattern, the ground, and the holiday cell tints. The motifs are drawn pictures with their own colors (an
orange pumpkin, a white ghost, each with a black outline so it sits on any sky), and a theme chooses which ones appear but does not
recolor them. If you want a specific look for one, draw it as a PNG (below); a few motifs (eggs, flowers, hearts) also have colored
`[name, variant]` versions.

### Your own art

Draw PNGs for a theme's header banner, footer strip and individual motifs, and they replace the generated ones: put
`header.png` (1440 x 227 px) and `footer.png` (1440 x 112 px) in `themes/<theme>/`, small square `motifs/<name>.png`
files beside them. A folder named for a theme (`halloween`), for a month (`oct`: any theme in October that has no folder of its own), or `default` (any theme at all) is used, in that order. `npm run art-guides` writes guide pictures at your panel's
size with the parts the date and legend plates will cover marked. The date (centered, with a white outline) and the legend (on a white plate) are still drawn over it,
and the weekday band keeps the theme's color. Art in `themes/` ships in the Docker image; art in `config/themes/` is
picked up from the mounted folder without a rebuild, and changes show on the next refresh. The names, sizes and rules
are in [themes/README.md](../themes/README.md).

### Holiday posters

On the holiday itself the whole calendar gives way to a **poster**: a full-bleed picture, a big greeting, and only today's agenda on
a plaque at the bottom (the `poster` layout). Eight are built in, one per holiday, each on the day only:

| Scene | Day | Greeting |
|---|---|---|
| `valentine` | Feb 14 | HAPPY VALENTINE'S DAY |
| `shamrock` | Mar 17 | HAPPY ST. PATRICK'S DAY |
| `easter` | Easter Sunday | HAPPY EASTER |
| `patriotic` | Jul 4 | HAPPY 4TH OF JULY |
| `halloween` | Oct 31 | HAPPY HALLOWEEN |
| `thanksgiving` | 4th Thursday of November | HAPPY THANKSGIVING |
| `christmas` | Dec 25 | MERRY CHRISTMAS |
| `newyear` | Dec 31 and Jan 1 | HAPPY NEW YEAR |

- **Turn them off** with `builtin_takeovers: false` (and list only your own), or `TAKEOVERS=off` for no posters at all. A poster
  is used only with `THEME=auto`: a display fixed to one theme, or to none, keeps its calendar.
- **Your own dates** go in `themes.takeovers`: `from` and `to` (`MM-DD`, or `easter` / `thanksgiving` with an offset in days; `to`
  defaults to `from`), the `scene`, and optionally a `greeting` of one or two lines (`false` for none). Yours come before the built-in ones,
  so `{ from: 12-24, to: 12-26, scene: christmas }` stretches Christmas over three days.
- **Your own picture** replaces a built-in scene, or makes a new one: save a 1440 x 2560 PNG as `themes/<scene>/poster.png`
  (`themes/halloween/poster.png`; for a scene of your own, any name you give a takeover, such as `birthday`). It is searched for in the
  same folders as the header and footer art (`THEMES_DIR`, `/config/themes`, `./config/themes`, `themes/`) and read again when it
  changes. The agenda plaque is drawn over the bottom, so keep what matters above it (`npm run art-guides` writes `poster-guide.png`
  with the covered parts marked). **A picture of your own is left bare**, with no greeting, unless the takeover gives a `greeting`
  (letters are outlined in yellow, so they read on any picture). A takeover whose scene is neither built in nor has a `poster.png` is ignored
  and the calendar is shown.
- `/preview?now=2026-10-31T12:00:00Z` shows a holiday's poster without touching the panel, and `&takeover=off` the calendar on that day.

The theme can change on any day (when a holiday window starts or ends, as well as at the turn of the month), which is one more
reason the picture changes at midnight. The built-in themes live in `src/themes.mjs`: a chrome color, a sky, a pattern, a ground and
a list of motifs.

## Previewing without a panel

With no `DISPLAY_HOST` / `DISPLAY_PIN` the server only renders and serves ("serve-only"). Open
`http://localhost:8080/` for the latest frame, or `/preview` to render one on demand.
`/preview?now=2026-11-03T15:00:00-05:00` shows another day (another month, another theme), `?layout=timeline`
and `?theme=easter` pick a layout and theme, and `?rotation=90` another orientation. `npm run demo` renders
the sample images in `docs/images/` from the synthetic calendars in `examples/`.

## Calendars

Any number of calendars, listed in a config file. Copy `config/config.example.yaml` to `config/config.yaml`:

```yaml
calendars:
  - id: personal                     # optional: defaults to the name, lowercased
    name: Me                         # optional: defaults to the calendar's own name
    color: blue                      # red | green | blue | yellow | black (default: assigned in order)
    url: "${PERSONAL_ICAL_URL}"      # an https:// link, a local .ics path, or ${VAR} from the environment
  - id: holidays
    name: US Holidays
    color: black
    mark_days: true                  # print its all-day dates in red on the grid
    url: "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"
```

Add or remove entries to scale up or down; the legend, the grid and the agenda follow. The colors are the panel's own
inks, so they stay solid and never dither. YAML and JSON are both accepted. Mistakes are reported by entry and key
(`calendars[2]: unknown key "colour"`), without ever printing a link.

**Where the file is found:** `CONFIG_FILE` if set (an error if it is missing), otherwise the first of
`/config/config.yaml`, `.yml`, `.json`, then the same names in `./config/`. In Docker the compose file mounts the
`config/` folder at `/config` read-only, so edit the file on the host and restart the container. Relative paths
inside the file (a local `.ics`) are relative to the file. `${NAME}` in any value is replaced from the environment, so
the links can stay in `.env` while the file is shared; a missing variable is an error that names it.

**Without a config file** the old variables still work: `CALENDARS=personal,family`, then `CALENDAR_<ID>_URL`, and
optionally `_NAME`, `_COLOR` and `_MARK_DAYS`. If the file has a `calendars` list, `CALENDARS` and `CALENDAR_*`
are ignored (the server says so at startup). `config/config.yaml` is git-ignored and kept out of the Docker image.

The same file can hold the **displays**, one entry each, with the `DISPLAY_<ID>_*` settings in lowercase
(`host`, `pin`, `mac`, `rotation`, `layout`, `theme`, `width`, `height`, `wake`, `sleep_after_push`,
`panel_sleeps_after_content`, `battery_check_hours`, ...; the example lists them all). A `displays` list replaces
`DISPLAYS` and `DISPLAY_*`; the shared `DISPLAY_PIN` is still the default PIN.

Get a calendar's URL in Google Calendar under Settings > the calendar > Integrate calendar >
**Secret address in iCal format** (a holiday calendar has a public one).

**A secret iCal link is a password:** anyone holding it can read that whole calendar. It lives only
in the git-ignored config file or `.env`, or a Secret, and the server never logs it. If a link has been shared or
pasted somewhere, use "Reset" next to it in Google Calendar to get a new one.

Feeds are fetched at most every 10 minutes (`CALENDAR_FETCH_SECONDS`) and the last good copy is
kept if Google is unreachable; that calendar's legend entry then says "(offline)". Edits show up on
the panel after the next fetch plus the next refresh, so allow up to about 25 minutes by default;
`curl -X POST localhost:8080/refresh` does it now.

## Repeating events and time zones

Repeating events are expanded by wall-clock time, so a 9:00 AM meeting stays at 9:00 AM when
daylight saving changes. Exclusions and moved instances are honored, all-day events use Google's
exclusive end date, and overnight events span both days. `npm test` runs the checks for these
(`test/calendar.test.mjs`). `TIMEZONE` decides what "today" is and how times are shown.

## Shopping list

`SHOPPING_SOURCE` is `none` (the agenda takes the whole bottom), `file`, or `googletasks`.

- **file:** `SHOPPING_FILE` points at a `.json` array (`["milk", {"text": "eggs", "done": true}]`)
  or a text file with one item per line (`- [x] eggs` marks one done).
- **googletasks:** reads a Google Tasks list (`GOOGLE_TASKS_LIST`, by name or id). Create an OAuth
  client of type "Desktop app" with the Tasks API enabled, then run
  `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.mjs` once and put the
  refresh token it prints in `.env`. **This adapter is written against Google's documented API but
  has not been run against a real account.**

The display only reads the list; you change it in whichever app owns it. If you want to change it by
voice, note that where the list lives matters more than which adapter reads it:

- **Google Home / Assistant** keeps its shopping list in **Google Keep** (since 2023), not Google
  Tasks, and Keep has no API for personal accounts, so this display cannot read it.
- **Alexa** syncs its shopping list with apps such as Todoist, AnyList and Any.do, not with Google
  Tasks or Keep. (From search results; some are old, so check the Alexa app's Lists settings.)
- **ColorNote** has no public API that I could find, so it cannot be read either.
- Google Tasks is readable here, but neither assistant writes to it as its shopping list, so a voice
  command would not reach it unless you bridge them yourself (an IFTTT or Home Assistant routine).
  A service both assistants can write to and that has an API (Todoist is the usual candidate) is the
  better base for a voice-edited list; adding an adapter for it is small once you choose.

## When the panel is redrawn

The panel does not poll, and every redraw flashes it for about 20 seconds, so *when* matters. Every
`REFRESH_INTERVAL_SECONDS` (15 minutes) the server fetches the calendars, draws the frame it would show
and compares it with the frame on the panel. `REDRAW_MODE` decides what happens next:

- **`auto`** (default): a difference is sent to the panel at once; no difference sends nothing (apart from
  a resend every `FORCE_PUSH_SECONDS`, 6 hours by default).
- **`manual`**: a difference only raises **redraw pending**. The panel is redrawn when something tells it to:
  Home Assistant (below) or `POST /api/displays/<id>/refresh`. There are no timed redraws.

Sending means connecting to the panel over the Samsung MDC protocol (TLS, PIN, port 1515) and telling it to
download the frame from here. Set `DISPLAY_HOST` and `DISPLAY_PIN`, or several displays with a `displays:` list in the config file (or
`DISPLAYS=a,b` and `DISPLAY_<ID>_*`). The defaults are a portrait image (1440x2560, rotation 0); a panel left in landscape mode
uses `PANEL_WIDTH=2560 PANEL_HEIGHT=1440 OUTPUT_ROTATION=90`.

**A picture counts as delivered only when the panel has fetched it.** The server watches for the panel's own
download of the image, not just for the panel accepting the command. A panel that cannot be reached or never
fetches (a wrong `PUBLIC_HOST`, a firewall) stays pending, raises **Panel update problem**, and is retried. The
picture's content ID is a hash of its pixels, so the same picture is never "new" to the panel; **Redraw now**
adds a nonce to force it.

Set `STATE_FILE=/data/state.json` (the compose file mounts `/data`) so a restart remembers what the panel
shows and does not redraw it.

## A panel on battery: waking, sleeping and battery life

An EMDX panel holds its picture with no power, so on battery its drain is mostly the Wi-Fi. It can sleep and
be woken over Wi-Fi when there is something to show. This is how the container uses that; the notes are from
the community write-ups ([Joyous](https://github.com/fayep/Joyous), [frontpage](https://github.com/lexdoudkin/frontpage/blob/main/PROTOCOL.md)),
so **check each step on your own panel before relying on it** (see [PROTOCOL.md](../PROTOCOL.md) for what was and was not confirmed).

1. **On the panel:** turn **Network Standby** on, and note its **Wi-Fi MAC** (not an Ethernet MAC).
2. **In `.env`:** `DISPLAY_MAC=<that MAC>`. With a MAC set, waking is on (`DISPLAY_WAKE=true`).
3. **Probe it:** `npm run probe` (or `docker compose run --rm samsung-epaper-calendar node scripts/panel-probe.mjs`).
   It is read-only: it opens a session (waking the panel if it is asleep, and reporting how long that took),
   reads the battery and power source (with the raw bytes, so you can check them), and asks for the Wi-Fi MAC.
   For a deeper, panel-only investigation (does it poll? does it fetch when woken? what wakes it?) use
   `scripts/panel_lab.py`: see [PANEL-LAB.md](PANEL-LAB.md).
4. **Optional, changes the panel:** `--enable-standby` turns Network Standby on from here; `--sleep-test` puts
   the panel to sleep and wakes it again, reporting the time. If it does not wake, press its power button.
5. **Then**, only after `test sleep-ladder` shows how long a sleep can last and still be woken (a panel that falls
   into a deep sleep needs its power button), set `DISPLAY_SLEEP_AFTER_PUSH=true`.

**What a push does:** connect (waking the panel first if it is asleep: a Wake-on-LAN packet to the subnet
broadcast, and Samsung's own packet straight to the panel's IP, resent every 10 s for up to 45 s), read the
battery, send the picture, wait until the panel fetches it, and (with sleep on) wait `DISPLAY_SETTLE_SECONDS`
(45) for the e-paper to refresh, then turn Network Standby on and put it to sleep. It never sleeps a panel
unless the panel accepted Network Standby in the same session, and never one that has no MAC to wake it with.
It does not sleep a panel on external power (USB or AC) unless `DISPLAY_SLEEP_ON_EXTERNAL_POWER=true`.

| Setting | Default | Meaning |
|---|---|---|
| `DISPLAY_MAC` | | The panel's Wi-Fi MAC. Needed for waking. |
| `DISPLAY_WAKE` | on if a MAC is set | Wake a sleeping panel before talking to it. |
| `DISPLAY_BROADCAST` | the panel IP's /24 | The subnet broadcast address for Wake-on-LAN (`192.168.1.255`). |
| `DISPLAY_SLEEP_AFTER_PUSH` | off | Let the panel sleep after a push. Turn on once the probe's sleep test passes. |
| `DISPLAY_PANEL_SLEEPS_AFTER_CONTENT` | off | Set this if the panel's own **"sleep immediately after receiving content"** switch is on. The panel then sleeps itself, so the container neither waits for the refresh nor sends a sleep command. **Not yet trusted for battery:** on a real panel it went quiet 76 s after a picture and was wakeable, but an overnight run with it on drained 4.7%/h and found the panel awake in the morning. Check with `panel_lab.py test drain` before relying on it. |
| `DISPLAY_SLEEP_ON_EXTERNAL_POWER` | off | Sleep even on USB or AC power. |
| `DISPLAY_SETTLE_SECONDS` | 45 | How long the e-paper is given to refresh before it is put to sleep. |
| `DISPLAY_WAKE_TIMEOUT_SECONDS` | 45 | How long to keep trying to wake the panel. |
| `DISPLAY_FETCH_TIMEOUT_SECONDS` | 60 | How long to wait for the panel to fetch a picture it was told about. |
| `DISPLAY_BATTERY_CHECK_HOURS` | 24 with a MAC | Wake the panel this often just to read the battery, then let it sleep again. `0` turns it off. |
| `DISPLAY_AUTO_SLEEP_MINUTES` | 20 | How long after waking the panel goes to sleep by itself (seen on an EM32DX: 20). After about this long without contact the container wakes it first. |
| `DISPLAY_MDC_PORT` | 1515 | The MDC port. |

**Battery life, measured on one EM32DX:** awake costs about 4% an hour, and sleeping with Network Standby (the sleep
that can be woken over Wi-Fi) about 1.5% an hour in 2-to-4-hour runs, so a charge lasts about 2 days, not months. Quiet one-hour runs gave 1 to 3 %/h whether the panel was slept by our command or by
its own sleep-after-content switch. (One overnight run fell 4.7% an hour and found the panel awake; the likeliest cause is
something else contacting it, and it is not reproduced.) Sleeping after each
push is still worth it (about 2.5x better than staying awake), but a half-year on battery would need a deeper sleep
that cannot be woken over the network. USB-C or PoE+ avoids the question.

**Battery life:** Home Assistant gets **Battery**, **Power source**, and **Battery days left**, a straight-line
estimate from the readings taken while on battery (it needs half a day of them and a falling charge). Whether a
charge lasts six months is something to measure: leave it a week or two and read the estimate. Network Standby
itself costs battery, so the fewer pushes and the sooner it sleeps, the better; the manual-mode,
redraw-when-the-room-is-quiet setup in the next section also saves refreshes.

**Docker and waking:** the compose file runs the container with `network_mode: host` (Linux). The panel
fetches pictures from this machine's own LAN address, and a Wake-on-LAN broadcast has to leave on your LAN. On a
Docker bridge network the broadcast does not leave the container, but a unicast Wake-on-LAN to the panel's IP woke
the panel on its own in testing (from a machine that had just talked to it), so waking should still work there;
on Docker Desktop (Mac or Windows) remove `network_mode: host`, add `ports:`, and set `PUBLIC_HOST`.

## Home Assistant (MQTT)

Set `MQTT_URL` (for example `mqtt://192.168.1.10:1883`, plus `MQTT_USERNAME` and `MQTT_PASSWORD` if the broker
wants them) and Home Assistant's MQTT integration finds a device per display, **Calendar main** for the default
display, through MQTT discovery, much like an ESPHome node. The decisions stay in your automations; the display
only reports and obeys. With `REDRAW_MODE=manual` the display never redraws on its own.

| Entity | What it does |
|---|---|
| `binary_sensor` **Redraw pending** | On when the picture on the panel is out of date. Starts on after a restart that has no state file. |
| `sensor` **Pending since** | When it first became out of date (a timestamp), for "force it after 6 hours" rules. |
| `sensor` **Status**, **Last redraw**, **Last checked** | `up to date` / `redraw pending` / `redraw failed`, or what it is doing now (`waking the panel`, `waiting for the panel to fetch it`, `panel refreshing`...), and when. |
| `sensor` **Events today**, **Shopping items** | Counts, handy for other automations. |
| `binary_sensor` **Calendar feed problem**, **Panel update problem** | On when a feed could not be fetched, or the panel could not be reached. |
| `button` **Refresh** | Fetch the calendars now and redraw only if the picture changed. This is the one for automations. |
| `button` **Redraw now** | Redraw even if unchanged (clears ghosting, recovers a blank panel). |
| `button` **Check for changes** | Fetch the calendars now and update **Redraw pending**, without redrawing. |
| `sensor` **Battery**, **Power source**, **Battery days left** | The panel's charge, `battery` / `ac` / `usb` / `wireless`, and the estimate of days left. Updated at every push and every battery check. |
| `sensor` **Panel state**, **Last wake time** | `asleep` / `awake` / `unknown` (what the container last did to it) and how many seconds the last wake took. |
| `button` **Check battery**, **Sleep panel** | Wake the panel if needed, read the battery and let it sleep; or put it to sleep now (only if it can be woken again). |
| `select` **Layout**, **Theme** | Switch layout (`paper`, `timeline`) or theme (`auto`, `none`, or a theme name) live. A change shows as pending. Both choices are retained over restarts. |
| `sensor` **Active theme** | The theme drawn now (what `auto` resolved to). |

Entity ids follow the device name, for example `binary_sensor.calendar_main_redraw_pending` and
`button.calendar_main_refresh`; check **Settings > Devices** for yours. Example: redraw once the picture is out
of date and the room has been still for ten minutes:

```yaml
automation:
  - alias: Redraw the calendar when the room is quiet
    mode: single
    trigger:
      - platform: state                     # something changed while the room is already quiet
        entity_id: binary_sensor.calendar_main_redraw_pending
        to: "on"
      - platform: state                     # or the room just went quiet while a change is waiting
        entity_id: binary_sensor.living_room_motion
        to: "off"
        for: "00:10:00"
    condition:
      - condition: state
        entity_id: binary_sensor.calendar_main_redraw_pending
        state: "on"
      - condition: state
        entity_id: binary_sensor.living_room_motion
        state: "off"
        for: "00:10:00"
    action:
      - action: button.press
        target:
          entity_id: button.calendar_main_refresh
```

A common addition is a second trigger at about 3 AM that presses **Refresh**, so the new date appears overnight.
If you want a backstop, add a condition on **Pending since** (for example, "pending for more than 12 hours:
redraw regardless of motion").

The same actions exist over HTTP (no authentication; keep the port on a trusted network):
`GET /api/displays/<id>/status`, and `POST /api/displays/<id>/refresh | redraw | check | battery | sleep` and
`POST /api/displays/<id>/layout?name=timeline` and `POST /api/displays/<id>/theme?name=easter`.

Topics, if you want them without discovery: `<prefix>/availability`, `<prefix>/<display>/state` (retained
JSON), and commands to `<prefix>/<display>/set/refresh | redraw | check | battery | sleep | layout | theme`, with the default prefix
`samsung-epaper-calendar`.

## How the picture is made

The panel has six inks and mixes them into everything else by dithering. Two settings decide who does that mixing,
one for the decoration and one for the edges of text and shapes. Solid fills and lines are always exact inks, and
colors very near an ink (outlines, today's yellow band) become that ink. A frame is drawn on two layers:

- **Content** (text, lines, boxes, bars, the date and legend plates) is drawn in the pure inks. `TEXT_AA` is what happens at the
  antialiased edges of letters and rounded corners:
  - **`panel`** (default): the edge pixels get true in-between colors (a letter's edge is gray) and the panel's own dithering
    resolves them. This looked best on a real EM32DX. The PNG is true color.
  - **`threshold`**: a pixel is ink if at least `TEXT_CUT` (default 0.4) of it is covered, else nothing. Crisp, but thin
    strokes can break up, which makes some lowercase letters look odd. Every pixel is exactly one of the six inks.
  - **`dither`**: ink in proportion to coverage, by a fixed pattern, so edges are a halftone. Also six inks only.
- **Theme art** (gradients, pastels, motifs, holiday-cell tints) is full color, and `ART_DITHER` says who mixes it:
  - **`panel`** (default): sent in true color, so the panel's own dithering mixes the inks.
  - **`pattern`**: we mix it from all six inks with a regular-pattern tile per color, so a pastel pink is white with some
    red, a purple is blue with red and a teal is green with blue, evenly, so it stays clean next to text. Red is never
    mixed with green (or yellow with blue), which would only speckle. The PNG is six colors (if `TEXT_AA` is not `panel`).
  - **`diffusion`**: we mix it by error diffusion, which is finer but noisier.

To compare, push a frame in each mode (`ART_DITHER` or `TEXT_AA` in `.env`, then restart), or look at the previews:
`/preview?art=pattern&text=threshold`. Which looks better on your panel is not something a screen can tell you.
`scripts/text-test.mjs` and `scripts/font-test.mjs` build a sheet of variants to push to the panel and compare side by side.

The `pattern` and `diffusion` modes mix against the nominal ink colors. The panel's real inks are duller. If you measure
them, give the server the measured colors with `PANEL_PALETTE='{"red":"#8a1c0c","blue":"#1d3f8a"}'` (any of black,
white, red, yellow, green, blue) and it will mix the art against those while still writing the exact inks.
`IMAGE_FORMAT=jpeg` still exists but blurs the exact colors; leave it on `png`.

## Running it from Home Assistant

HACS installs *integrations*: Python code that runs inside Home Assistant itself. This service is a Node
container, so it cannot be a HACS integration without being rewritten in Python (calendar parsing, drawing and
the panel protocol), which is not worth it. The natural fit on a Home Assistant Yellow (Home Assistant OS) is a
**custom add-on**: a small repository with a `repository.yaml` and a folder containing a `config.yaml` and this
Dockerfile, installed from the add-on store. An add-on is a container the Supervisor manages for you. It can use
host networking (for Wake-on-LAN), and the Supervisor can hand it your MQTT broker's address and password, so
there is nothing to copy by hand. The CM4 has the memory for it (a frame renders in a few hundred MB), and the
canvas and sharp libraries have arm64 builds. That wrapper is not built yet; for now run the compose file on any
Linux host on the same network.

## Notes and limitations

- **No authentication:** the control API redraws the panel, and the frame shows your calendar to anyone
  who can reach the port. Keep it on a trusted network. Anyone who can publish to your MQTT broker can
  control the display the same way.
- **What is verified:** the panel behavior described here was measured on one EM32DX and is written up, with what is still unknown, in [PROTOCOL.md](../PROTOCOL.md). Everything is also tested against a fake panel that speaks the real protocol, and the MQTT side against a Mosquitto broker.
- **Long titles** are cut with a compact ellipsis (three small dots, about half the width of the font's own "…") in the month grid (about 12 characters per day); the
  agenda shows them in full, wrapped to two lines.
- A feed can hold years of history; only the visible weeks and the next three weeks are expanded.
