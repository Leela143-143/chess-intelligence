# Self-hosted typefaces

The app is an offline-first PWA, so both families are served from our own origin
instead of a font CDN. Nothing here was resized, renamed, re-subsetted or
otherwise modified — these are the upstream latin subsets.

| File | Family / style | Copyright | License | Upstream |
|---|---|---|---|---|
| `instrument-serif-latin.woff2` | Instrument Serif 400 | Copyright 2022 The Instrument Serif Project Authors | SIL OFL 1.1 | https://github.com/Instrument/instrument-serif |
| `instrument-serif-italic-latin.woff2` | Instrument Serif 400 Italic | Copyright 2022 The Instrument Serif Project Authors | SIL OFL 1.1 | https://github.com/Instrument/instrument-serif |
| `inter-latin-var.woff2` | Inter Variable 100–900 | Copyright 2016 The Inter Project Authors | SIL OFL 1.1 | https://github.com/rsms/inter |

- **License text:** `OFL.txt` (SIL Open Font License 1.1).
- **Redistribution:** permitted by OFL 1.1, including inside a GPL-3.0
  application. No Reserved Font Name conflict, because the files are unmodified.
- **Attribution requirement:** the OFL notice must travel with the font software
  (this file and `OFL.txt` are shipped in `dist/fonts/`), and the app displays
  the faces and their licenses on the Diagnostics screen.
- If a font is ever modified or subsetted, it must be renamed away from the
  Reserved Font Name and this table updated.

Consumers: `src/styles/tokens.css` declares the three `@font-face` rules
(`--font-display`, `--font-ui`, plus the monospaced numerals stack). Replacing a
face means updating both files and this table.
