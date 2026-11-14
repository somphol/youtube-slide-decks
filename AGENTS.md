# AGENTS.md

## What this is

A public, static collection of YouTube videos presented as slide decks. Each deck is JSON plus
downloaded thumbnails; a dependency-free viewer browses it on GitHub Pages. The viewer can export a
`.pptx`, add a video, delete a video and edit tags — writes are commits made from the browser through
the GitHub REST API. Not a video downloader, not a backend.

## Commands

```sh
node scripts/deck.mjs list                     # decks
node scripts/deck.mjs add "Deck" "<url>" --tag "llm, inference" --create
node scripts/deck.mjs tag "Deck" <video-id|index> "a,b"
node scripts/deck.mjs export --all             # exports/*.pptx (optional)
node scripts/deck.mjs serve                    # http://localhost:4173/
node scripts/deck.mjs verify --remote
npm run sync-site                              # skill template → repo root viewer
npm run install-skill                          # repo skill → ~/.config/opencode/skills
```

Deploy: push to `main`. GitHub Pages serves the repository root; no build step.

## Architecture

- `skills/youtube-slide-decks/scripts/deck.mjs` — all CLI commands, storage, static server.
- `skills/youtube-slide-decks/scripts/pptx.mjs` — Node image resolver; calls `pptx-core.mjs`.
- `skills/youtube-slide-decks/assets/site/assets/pptx-core.mjs` — pure OOXML + stored-ZIP builder,
  shared by CLI and browser.
- `assets/app.js` — viewer, keyboard, tag view, export and write-action wiring.
- `assets/github.js` — repo/branch config, token storage, `gh()`, single-commit `commitChanges()`.
- `assets/connect.js` — token dialog; `ensureToken()` resolves the token string.
- `assets/mutations.js` — add, delete, retag, rename tag, delete tag. Every action is one commit.
- `assets/add.js`, `dialogs.js`, `tags.js` — add dialog, confirm/prompt dialogs, tag page.
- `assets/tags.mjs` — tag normalisation and tally, shared with the CLI.
- `decks/<id>/deck.json` — the record; `decks/index.json` is derived, including `tags`.
- `skills/.../assets/site/` — viewer template. Root files are generated copies: edit the template, then
  `npm run sync-site`.

Write flow: viewer → `mutations.js` → fresh read of deck + catalog → one tree/commit/ref update.
Tag view: `deck.html?tag=…` loads every deck, flattens matching slides into a virtual deck, and reuses
the normal viewer.

## Decisions and constraints

- **JSON on disk, not a database.** Diffs, git recovery, no server.
- **Thumbnails local, not hotlinked.** The 9 KB floor rejects YouTube’s grey placeholder.
- **One PPTX builder.** `pptx-core.mjs` must stay free of `fs`, `path`, `Buffer`; the browser imports it.
- **One tag implementation.** `tags.mjs` is imported by both the browser and the CLI. Normal form is
  lowercase kebab, max 24 chars, max 8 per slide.
- **The token is the whole security model.** Fine-grained, Contents: Read and write, stored in
  `localStorage`, sent only to `api.github.com`. Never log it, never add it to the repo.
- **Every API read is `cache: 'no-store'`.** GitHub responses are cacheable; a stale ref produced
  “not a fast forward” (422) and looked like a broken commit.
- **Pages serves the repository root.** `.nojekyll` must stay. No build step. `.mjs` must be served as
  `text/javascript`; the local server’s MIME map matters.
- **Exports are never committed.** CLI writes to gitignored `exports/`; the browser downloads directly.
- **Never hand-edit `decks/index.json`.** Run `rebuild`; the browser updates it in the same commit.
- **Deck id = directory name.** `rename` handles both.
- **Tag rename/delete rewrites every affected deck in one commit** and recomputes the full tally.

## Known issues

- Google Slides import is verified structurally (`python-pptx`, Quick Look, `unzip -t`) and browser
  export by a headless download, not by an actual Google upload.
- The tag page’s counts update locally after a write; a hard refresh is needed if another browser
  commits at the same time.
- Concurrent writers can hit a 422; the UI asks to retry. No automatic merge.
- Deleting the last slide leaves an empty deck; add a video or delete the deck from the CLI.
- Remote-only thumbnails may fail CORS during browser export and are then skipped.
- `sddefault` is 4:3; no cropping is applied.
- No in-browser deck creation or rename yet; use the CLI or ask the skill.
- macOS-only validation so far; the code itself only needs Node 18+.

## Continuity

- Local project: `~/Projects/youtube-slide-decks`
- Installed skill: `~/.config/opencode/skills/youtube-slide-decks` (copy; repo is canonical)
- Remote: `https://github.com/somphol/youtube-slide-decks` (public)
- Live: `https://somphol.github.io/youtube-slide-decks/` — Pages, branch `main`, root
- Screenshots: `docs/preview.png`, `docs/deck.png`
- Prompt log: `docs/prompts.md`
