# Project context for contributors and AI assistants

A Node.js service that draws a Google Calendar month, today's agenda and a shopping list for a
**Samsung EM32DX (EMDX)** Spectra 6 e-paper panel hung in portrait, and delivers it over Samsung MDC.
User docs: `README.md`, `docs/CONFIGURATION.md`. What is known about the panel: `PROTOCOL.md`. Testing a real panel:
`docs/PANEL-LAB.md`. Tests: `npm test` (node:test, no network, a fake panel stands in for hardware).

## Rules

- **The panel only has six inks; `src/quantize.mjs` decides who converts to them, us or the panel**: a frame is drawn
  on two layers, `content` (text, lines, boxes, bars, plates: snapped to the nearest ink, never dithered)
  and `art` (theme decoration, in full color). `ART_DITHER` says who dithers the art: `panel` (default) sends it in true
  color for the panel to dither; `pattern` (a regular-pattern tile per color from all six inks; red is never mixed
  with green, nor yellow with blue) and `diffusion` are done by us. `TEXT_AA` says what happens at the antialiased
  edges of content: `panel` (default, true in-between colors, judged best on a real panel), `threshold` or `dither`
  (both leave only the six inks). With the defaults the PNG is true color; with `pattern`/`diffusion` art and
  `threshold`/`dither` text it is a palette PNG of exactly the six inks. Solid content is exact inks in every mode;
  tests that assert "every pixel is an ink" render with `art: 'pattern', text: 'threshold'`. **Anything decorative must be drawn on `S.art`**
  (see `styleFor` and the `fillChrome`/`plate` helpers in `draw.mjs`); anything read goes on `ctx`. Do not
  put JPEG back: it blurs the exact inks. Theme colors may be any color; the calendar boxes stay white;
  anything read on decoration sits on a solid white plate (or gets a dark outline, `bandText`). Calendar
  colors are red, green, blue, yellow or black.
- **Private calendar links are credentials.** They live in `.env` (git-ignored) or a Secret, never in code,
  docs, tests, fixtures, screenshots or logs. The code never logs a calendar URL (only the calendar id); keep
  it that way, including in error messages. Demo data lives in `examples/` and uses fake names and
  `example.invalid` addresses; screenshots in `docs/images/` come from it (`npm run demo`), never from a real calendar.
- **Nothing on the picture may depend on the time of day.** The controller redraws (auto) or raises
  "redraw pending" (manual) only when the frame's hash changes, so an event ending must not change the picture.
  So: no "updated at" clock, no hiding finished events, no "now" line. The date turning at midnight is the one
  expected daily change.
- **Repeating events are expanded by wall-clock time** (`calendar.mjs`): the rule runs on a floating wall time,
  then each instance is converted to an instant in the event's own zone, so daylight saving never moves a
  meeting. node-ical does not do this for you. Exclusions and moved instances are matched by instant (timed) or
  day key (all-day). Do not "simplify" this back to raw `rrule` dates; `test/calendar.test.mjs` pins the behavior.
- Day math uses day keys (`YYYY-MM-DD`, `src/dates.mjs`), never instants plus 86400000. All-day dates from
  node-ical are local-midnight Dates of the *machine's* zone, hence `dateOnlyKey`.
- Frames render one at a time (`render()` queues), because `px()` reads the current geometry (and `useFont` and `useMotifImages` set per-frame state the same way).

## Layout of the code

- `src/config.mjs` env parsing (shopping, redraw mode, MQTT, display settings); `src/configFile.mjs` the optional
  YAML/JSON config file that holds the `calendars` and `displays` lists (`${VAR}` interpolation, strict keys, errors that
  never print a link; `config/config.example.yaml`); the old CALENDARS / DISPLAYS variables remain the fallback; `src/calendar.mjs` fetching
  (http(s) or a local file), expansion, `buildMonth`, `dayAgenda`, `upcomingDays`; `src/draw.mjs` the drawing parts
  (header, month grid, agenda, coming up, shopping); `src/themes.mjs` the themes (a design per month, holiday themes, motifs), `buildThemePlan` (your `themes:` settings: months, holiday windows, custom themes) and `resolveTheme` (by date); `src/themeArt.mjs` loads the user's own header/footer/motif PNGs
  (`themes/`, `config/themes/`, `THEMES_DIR`) that replace the generated scenery, and `scripts/art-template.mjs` makes the guides to draw them over;
  `src/layouts.mjs` the two layouts (paper, timeline) built from those parts; `src/render.mjs` frame + encoding;
  `src/controller.mjs` change detection, redraw pending, auto/manual mode, the optional state file; `src/mqtt.mjs`
  Home Assistant discovery, state and commands; `src/shopping.mjs` the list sources; `src/server.mjs` displays,
  delivery, HTTP routes.
- **The panel conversation is in `mdc.mjs` (session, frames, commands), `wake.mjs` (Wake-on-LAN and Samsung's
  packet), `panel.mjs` (wake, push, wait for the fetch, settle, battery, sleep) and the server's `deliver`.**
  Rules learned the hard way (details and evidence in `PROTOCOL.md`): every connect and command has a timeout (the
  stock library had none and could hang the queue forever); the connect is the session, so nothing may "probe"
  the MDC port; a push counts only when the panel itself GETs the manifest's image URL (previews and thumbnails
  must not count: only `/api/display-content/:id/image` marks it); never sleep a panel unless it accepted Network
  Standby in the same session and has a MAC to be woken with; content IDs are a hash of the picture (plus a nonce
  when forced or when nothing is known about the panel), because the panel ignores a reused file name; the
  manifest JSON escapes slashes (`\/`) and gives `file_size` as a string.
  `test/support/fakePanel.mjs` is a real TLS MDC server (it can start "asleep") used by the tests.
- **Redraw policy lives in the controller, not the loop.** Every refresh interval it renders and compares with
  what the panel shows. `REDRAW_MODE=auto` sends a change at once; `manual` only raises pending and Home Assistant
  (MQTT buttons) or `POST /api/displays/<id>/refresh` sends it. A failed push leaves the display pending. HA
  entities are in `docs/CONFIGURATION.md`; discovery uses `has_entity_name` with no `object_id` (deprecated), so
  entity ids come from the device name "Calendar <display id>".
- Layouts are `(ctx, model, {w, h, S})` functions, where S = `styleFor(theme)`. A theme (`themes.mjs`) is full
  color: a chrome color (weekday band, panel headers; dark enough for white text), a banner and footer scene
  (gradient sky, scattered pattern, ground: hills/snow/waves/stripes), motifs (`strip`) and holiday `marks` that
  tint and decorate that day's cell (Easter by computus, Thanksgiving as 4th Thursday). A themed frame reserves a
  taller header (`headerH`) and a footer (`footerH`) that holds the legend; layouts must use those, not
  constants. `THEME=auto` resolves by the date of `model.today`: a holiday window (`BUILTIN_WINDOWS`, plus the config's) if one
  holds it, else the month's design (`MONTH_THEMES`, overridden by the config's `themes.months` or `THEME_JAN`..`THEME_DEC`); HA's
  Theme select overrides all. Holiday cell decorations (`marks`) are independent of the theme: every built-in one shows in any design.
- Month grid: bars (all-day or multi-day) get lanes across a week; timed single-day events fill the rows each
  day's bars leave free; overflow is "+N more". Cell capacity comes from the row height.
- Keep the drawing parts in `draw.mjs` free of data logic.

## Shopping list

Sources are `file` (tested) and `googletasks` (written against the documented API, **never run against a real
account**). Google Home/Assistant lists live in Keep (no personal-account API); Alexa syncs with
Todoist/AnyList/Any.do. Todoist is the likely next adapter.

## Not yet verified

Pushing to a real panel from this server end to end (tested against the fake panel only; the individual MDC
commands, waking and battery readings were confirmed on a real EM32DX with `scripts/panel_lab.py`, see
`PROTOCOL.md`). Sleeping from the server (`DISPLAY_SLEEP_AFTER_PUSH`) and a long unattended run on battery are
also untested: do not enable them without reading the drain and deep-sleep notes in `PROTOCOL.md`. The Google
Tasks adapter and the Home Assistant side (the MQTT side was checked against a Mosquitto broker) have not been
run against real accounts or a real Home Assistant.

## Before publishing changes

Run `npm test` and `npm run demo` (it re-renders `docs/images/` from the synthetic calendars). Never commit `.env`,
logs (`*.log`, `*.jsonl`), `state.json`, `mockups/` or anything rendered from a real calendar.
