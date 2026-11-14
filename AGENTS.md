# AGENTS.md

## What this is

A public, static collection of YouTube videos presented as slide decks. Each deck is JSON plus
downloaded thumbnails; a dependency-free viewer browses it on GitHub Pages, and the viewer’s
**Export .pptx** button builds a PowerPoint file in the browser for Google Slides. It is not a video
downloader, not a YouTube API client, and not a backend.

## Commands

```sh
node scripts/deck.mjs list                     # decks
node scripts/deck.mjs add "Deck" "<youtube-url>" --create
node scripts/deck.mjs export --all             # exports/*.pptx (optional)
node scripts/deck.mjs serve                    # http://localhost:4173/
node scripts/deck.mjs verify [--remote]
npm run sync-site                              # skill template → repo root viewer
```

Deploy: push to `main`. GitHub Pages serves the repository root; no build step.

## Architecture

- `skills/youtube-slide-decks/scripts/deck.mjs` — all commands, storage, static server.
- `skills/youtube-slide-decks/scripts/pptx.mjs` — Node wrapper: resolves image bytes, calls the core.
- `skills/youtube-slide-decks/assets/site/assets/pptx-core.mjs` — pure OOXML + stored-ZIP builder,
  shared by the CLI and the browser. No Node built-ins, no dependencies.
- `assets/app.js` — viewer, keyboard navigation, client-side export.
- `decks/<id>/deck.json` — the record; `decks/index.json` is derived from the folders.
- `index.html`, `deck.html`, `assets/styles.css` — viewer shell.
- `skills/youtube-slide-decks/assets/site/` — viewer template that `init` copies into new collections.
  Root files are generated copies; edit the template, then `npm run sync-site`.
- `scripts` is a symlink to `skills/youtube-slide-decks/scripts`, so there is one implementation.

Data flow: URL → oEmbed + watch page + thumbnail → `deck.json` → `rebuildIndex()` → viewer.
Export flow: viewer → `fetch` thumbnails → `pptx-core.mjs` → Blob download.

## Decisions and constraints

- **JSON on disk, not a database.** Diffs, git recovery, no server.
- **Thumbnails local, not hotlinked.** `--hotlink` exists for exceptions; default is a downloaded JPG.
  The 9 KB floor rejects YouTube’s grey placeholder for missing `maxresdefault`.
- **One PPTX builder.** `pptx-core.mjs` must stay free of Node built-ins so the browser can import it.
  The Node wrapper supplies bytes from disk; the browser supplies bytes from `fetch`.
- **Exports are never committed.** They are derived and binary; the CLI writes to gitignored
  `exports/`, the browser downloads directly.
- **Pages serves the repository root.** `.nojekyll` must stay. Do not add a build step.
- **Never hand-edit `decks/index.json`.** Run `rebuild`.
- **Deck id = directory name.** `rename` handles both; manual folder renames break the catalog.
- **YouTube ids are 11 chars** of `[A-Za-z0-9_-]`; `videoIdFrom` is the only parser.
- **Static server MIME types matter.** `.mjs` must be served as `text/javascript`, or the viewer’s
  module import fails silently.

## Known issues

- Google Slides import is verified structurally (`python-pptx`, Quick Look, `unzip -t`) and the browser
  export is verified by a headless-Chrome download, not by an actual Google upload.
- Browser export fetches each thumbnail sequentially; a 50-slide deck takes a few seconds.
- If a thumbnail is remote-only and `i.ytimg.com` refuses CORS, the slide exports without an image.
- `sddefault` is 4:3; the exporter crops nothing, so an `sddefault` fallback gets letterboxing.
- Duration scraping depends on the watch page containing `"lengthSeconds"`; when absent the field is
  null and the slide still works.
- No in-browser deck editing: a static site cannot commit to git. Decks are created through the
  skill/CLI.
- macOS-only validation so far; the code itself only needs Node 18+.

## Continuity

- Local project: `~/Projects/youtube-slide-decks`
- Installed skill: `~/.config/opencode/skills/youtube-slide-decks` (copy; repo is canonical)
- Remote: `https://github.com/somphol/youtube-slide-decks` (public)
- Live: `https://somphol.github.io/youtube-slide-decks/` — Pages, branch `main`, root
- Screenshot: `docs/preview.png` (regenerate with `serve` + headless Chrome)
