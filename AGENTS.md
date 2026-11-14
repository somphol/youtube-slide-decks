# AGENTS.md

## What this is

A private, local-first collection of YouTube videos presented as slide decks. Each deck is JSON plus
downloaded thumbnails; a dependency-free static viewer browses it, and an exporter writes a `.pptx`
that Google Slides imports. It is not a video downloader, not a public site, and not a YouTube API
client.

## Commands

```sh
node scripts/deck.mjs list                     # decks
node scripts/deck.mjs add "Deck" "<youtube-url>" --create
node scripts/deck.mjs export --all             # exports/*.pptx
node scripts/deck.mjs serve                    # http://localhost:4173/
node scripts/deck.mjs verify [--remote]
```

`npm run list|serve|verify|export` wrap the same calls. No install step, no dependencies.

Publish (private only):

```sh
gh auth status
git add -A && git commit -m "…"
gh repo create youtube-slide-decks --private --source . --remote origin --push
```

## Architecture

- `skills/youtube-slide-decks/scripts/deck.mjs` — all commands, storage, the static server.
- `skills/youtube-slide-decks/scripts/pptx.mjs` — OOXML package + stored-ZIP writer.
- `decks/<id>/deck.json` — the record; `decks/index.json` is derived from the folders.
- `index.html`, `deck.html`, `assets/app.js`, `assets/styles.css` — viewer; reads the two JSON files.
- `skills/youtube-slide-decks/assets/site/` — the viewer template that `init` copies into a new
  collection. After editing it, run `npm run sync-site` to refresh the root viewer.
- `scripts` is a symlink to `skills/youtube-slide-decks/scripts`, so there is one implementation.

Data flow: URL → oEmbed + watch page + thumbnail → `deck.json` → `rebuildIndex()` → viewer / exporter.

## Decisions and constraints

- **JSON on disk, not a database.** Diffs, git recovery, no server.
- **Thumbnails local, not hotlinked.** `--hotlink` exists for exceptions; default is a downloaded JPG.
  The 9 KB floor rejects YouTube’s grey placeholder for missing `maxresdefault`.
- **`.pptx` must stay Python-free.** `pptx.mjs` writes stored ZIP entries and the minimum OOXML part
  set. Adding npm dependencies defeats the point.
- **Exports are gitignored.** They are derived and binary; regenerate them.
- **No public hosting.** Thumbnails belong to creators. Do not enable Pages, do not make the repo
  public.
- **Never hand-edit `decks/index.json`.** Run `rebuild`.
- **Deck id = directory name.** `rename` handles both; manual folder renames break the catalog.
- **YouTube ids are 11 chars** of `[A-Za-z0-9_-]`; `videoIdFrom` is the only parser.

## Known issues

- Google Slides import is verified structurally (`python-pptx`, Quick Look, `unzip -t`), not by an
  actual upload.
- `sddefault` is 4:3; the exporter crops nothing, so an `sddefault` fallback gets letterboxing.
- Duration scraping depends on the watch page containing `"lengthSeconds"`; when absent the field is
  null and the slide still works.
- No in-browser editing: a static site cannot commit to git. Decks are created through the skill/CLI.
- macOS-only validation so far; the code itself only needs Node 18+.

## Continuity

- Local project: `~/Projects/youtube-slide-decks`
- Installed skill: `~/.config/opencode/skills/youtube-slide-decks` (copy; repo is canonical)
- Remote: `origin` — must be **private**; verify with `gh repo view --json visibility`
- Vue/viewer screenshots: `docs/preview.png` (regenerate with `serve` + headless Chrome)
