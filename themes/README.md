# Your own theme art

Draw PNGs and the server uses them instead of the generated scenery. Anything you do not provide stays generated, so you can
start with one month's header and go from there.

```
themes/
  halloween/
    header.png            the banner behind the date      1440 x 227 px
    footer.png            the strip behind the legend     1440 x 112 px
    motifs/pumpkin.png    one small picture in place of a generated motif (ghost.png, bat.png, ...)
  oct/                    the same files, for any theme in October that has no folder of its own
  default/                the same files, for any theme at all that has neither
  guides/                 header-guide.png and footer-guide.png, to draw over (made by `npm run art-guides`)
```

**Theme names** (the folder names) are the twelve month designs `january`, `february`, `march`, `april`, `june`, `august`,
`november` and `december` plus `spring` (May), `summer` (July), `school` (September) and `autumn` (October); the holiday
themes `valentine`, `shamrock`, `easter`, `patriotic`, `halloween` and `christmas`; `winter`; and any custom theme you define in the
config file. **Month folders** are `jan` ... `dec`. A holiday window uses its own theme (so `halloween/` covers Oct 24 to 31), and
`oct/` fills in for it if there is no `halloween/`. Which theme is worn when is in docs/CONFIGURATION.md ("Themes"): you can change
it, and define your own, in the config file.
**Motif names** are the generated pictures' names: egg, chick, bunny, flower, tulip, butterfly, heart, shamrock, rainbow, coin,
pumpkin, ghost, bat, moon, acorn, tree, ornament, star, snowflake, snowman, gift, candycane, sun, wave, palm, beachball, leaf,
apple, pencil, book, fireworks.

## Holiday posters

On a holiday the calendar gives way to a full-screen poster with only today's agenda on a plaque (see "Holiday posters" in
docs/CONFIGURATION.md for the dates). Draw your own and it replaces the built-in scene:

```
themes/
  halloween/poster.png    1440 x 2560 px: replaces the built-in Halloween scene (valentine, shamrock, easter, patriotic,
                          thanksgiving, christmas and newyear are the others)
  birthday/poster.png     a scene of your own: name it in the config file, `takeovers: [{ from: 06-14, scene: birthday }]`
```

- **Draw at 1440 x 2560** (a different size is scaled to cover the screen and centered).
- **The agenda plaque covers the bottom**: at least the lowest 330 px, up to about 1075 px on a day with a long agenda. Keep what matters
  above y = 1450. `npm run art-guides` writes `themes/guides/poster-guide.png` with these zones marked.
- **No lettering is added to your picture** unless you ask: put the greeting in the picture, or give the takeover a `greeting`
  (`greeting: [HAPPY, BIRTHDAY]`), which prints one or two outlined lines over the top (about y = 100 to 480) and the date under them.
- Use full color; the panel dithers it like the other art. Big flat areas, black outlines and strong colors come out best on six inks.
- The same folders are searched as for the header and footer, and the file is read again when it changes.

## Sizes and what is drawn over your art

- **Draw at the size above** (for a 1440 x 2560 panel). A different size is scaled to cover the space and centered, so
  anything near the edges may be cropped. `npm run art-guides` writes `themes/guides/header-guide.png` and `footer-guide.png`
  for your panel's size, with the covered parts marked.
- **The date is centered on the header**, in black with a white outline (as wide as the date, up to about 75% of the
  width), and the **legend sits on a white plate** centered in the footer. Keep what matters out from under them. They cannot
  be turned off: that is what keeps the text readable on any art. Over your own banner the date is also centered top to
  bottom; over the generated scene it sits above the ground.
- A thin line in the theme's color is drawn along the bottom of the header and the top of the footer.
- A `header.png` replaces the generated banner **including its motifs**; likewise `footer.png`. A motif PNG replaces that
  generated motif everywhere it appears (the header and footer when you have no banner of your own, the little picture in
  each panel title, and the holiday cells in the month grid). It is fitted into a square box, so draw it square, with a
  transparent background.
- The weekday band and panel titles keep the theme's color.
- Use **full color** and transparency freely. The art goes to the panel like the generated art does, and the panel's own
  dithering turns it into its six inks (`ART_DITHER`, see docs/CONFIGURATION.md). Large flat areas of the pure panel colors
  (red, yellow, green, blue, black, white) come out solid; anything else is dithered, so judge it on the panel.

## Where to put the files

Folders are searched in this order, and the first match wins: `THEMES_DIR` (`THEMES_DIR=none` searches nowhere), `/config/themes`,
`./config/themes`, then this `themes/` folder. Art in `themes/` ships in a Docker image you build yourself; for art you want to
change without rebuilding, put it in `config/themes/` (the same layout): in Docker the `config/` folder is mounted at `/config`.
**Your art is not published:** `.gitignore` keeps every PNG in `themes/` and `config/` out of git (only this README and the guides are
tracked), because art is personal. The published container image has none.
Files are read again when they change, so save, and the next refresh shows it (or `POST /refresh`).
