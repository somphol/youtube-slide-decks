---
name: YouTube Slide Decks
description: Turn YouTube links into a browsable deck of thumbnail slides — add, delete and tag videos, create/list/rename decks, browse by tag, preview locally, and export a .pptx that Google Slides can import. Use when the user pastes a YouTube URL and names a deck, or asks to manage a video slide-deck collection.
version: 1.2.0
---

# YouTube Slide Decks

A deck is a folder of plain JSON plus downloaded thumbnails. A static viewer shows one video per slide,
groups videos by tag, and can export the deck as a widescreen `.pptx`. The public site also writes:
add, delete and retag each commit to GitHub from the browser with a fine-grained token.

## When to use

- The user pastes a YouTube URL with a deck name: “Put this <url> in AI/ML Educational Video Slide deck”.
- The user wants to list, create, rename, reorder or prune decks.
- The user wants tags on videos, a tag overview, or every video with one tag.
- The user wants a PowerPoint file for Google Slides.
- The user asks to preview or publish the collection.

## The collection

Default home: `~/Projects/youtube-slide-decks` (override with `--home <dir>` or `DECK_HOME`).
Public site: `https://somphol.github.io/youtube-slide-decks/` (GitHub Pages, repository root).
The repository is the database:

```text
<home>/
├── decks/index.json                  catalog + tag tally — never hand-edit
├── decks/<deck-id>/deck.json         one deck; each slide carries `tags`
├── decks/<deck-id>/thumbnails/       <videoId>.jpg
├── index.html, deck.html, tags.html  viewer, deck page, tag manager
├── assets/                           viewer JS/CSS, shared builders
├── exports/<deck-id>.pptx            generated, gitignored
└── scripts/deck.mjs                  CLI (zero dependencies)
```

Run the CLI from the collection root, or use the absolute path:

```sh
H=~/Projects/youtube-slide-decks
node "$H/scripts/deck.mjs" list
```

## Workflow: add a video

1. Resolve the deck. `add` matches the id, the title, a unique substring, and ignores a trailing
   “slide deck / slides / deck” in the user’s phrasing.
2. Add with `--create` so a new deck is made when nothing matches, and pass tags if the user named any:

```sh
node "$H/scripts/deck.mjs" add "AI/ML Educational Video Slide deck" \
  "https://www.youtube.com/watch?v=I2QhfZ0aVmk" --tag "llm, inference" --create
```

3. If the name is ambiguous the command exits 2 and prints candidates. Show them, ask one short
   question, then re-run with the exact id.
4. Report: deck title, video title as fetched by oEmbed, tags, slide count. Do not retype the title
   from the URL.

Tags are lowercase kebab, max 24 characters, max 8 per video, deduplicated. `tag` replaces a video’s
tags:

```sh
node "$H/scripts/deck.mjs" tag "AI/ML Educational Videos" I2QhfZ0aVmk "llm, serving"
```

## Browser writes

The viewer can add, delete and retag without the CLI. It commits `deck.json`, `decks/index.json` and
(new) thumbnails in one commit through the GitHub REST API. A fine-grained token scoped to the repo with
Contents: Read and write is stored in the browser’s `localStorage` and sent only to `api.github.com`.

Do not ask the user to paste a token into chat, and never put one in a file. Point them at
GitHub → Settings → Developer settings → Fine-grained tokens, then the **Connect GitHub** dialog.

- **Add:** deck page → `+ Add video` (URL, tags, note).
- **Delete:** deck page → `Delete` on the current slide.
- **Retag:** deck page → `＋ Tag`; or tags page → Rename / Delete for a global rewrite.
- **Tag view:** `deck.html?tag=<name>` gathers every matching video across decks with the normal
  arrows, filmstrip and export.

## Commands

| Command | Purpose |
| --- | --- |
| `list [--json]` | decks with id, title, slide count, updated date |
| `create "Title" [--description "..."]` | empty deck |
| `add "Deck" <url...> [--create] [--note "..."] [--tag "a,b"] [--force] [--hotlink]` | add videos |
| `tag "Deck" <video-id\|index> "a,b"` | replace a slide’s tags |
| `remove "Deck" <video-id\|url\|index>` | delete one slide and its thumbnail |
| `move "Deck" <video-id\|index> <position>` | reorder |
| `rename "Deck" "New title"` | rename, and re-slug the folder when free |
| `delete "Deck" --yes` | delete a whole deck |
| `export ["Deck" \| --all] [--out DIR]` | write `.pptx` |
| `rebuild` | regenerate `decks/index.json` (including tags) |
| `verify [--remote]` | schema, tags, thumbnails, catalog, exports |
| `serve [--port 4173]` | local viewer |

## Export to Google Slides

In the viewer, **Export .pptx** builds the file client-side and downloads `<deck-id>.pptx`. From the
CLI, `export --all` writes the same format to gitignored `exports/`. Either file imports via Google
Drive → upload → Open with Google Slides, or File → Import slides.

Each slide carries the thumbnail, title, channel, duration, tags, the deck title as a kicker, and two
clickable paths to the video.

## Rules

- Never edit `decks/index.json` by hand; run `rebuild`.
- Never invent thumbnails. Missing images fall back to a remote `i.ytimg.com` URL and `verify` warns.
- Keep deck ids lowercase kebab-case. Do not rename deck folders manually.
- `--hotlink` skips the download and stores the remote thumbnail URL. Use it only when storage matters.
- Thumbnails belong to their creators. Keep `ATTRIBUTION.md` accurate; when a creator asks for removal,
  delete the slide and push. The collection is public, so removal is immediate after deploy.
- Publish by pushing to `main`; Pages deploys the repository root.

## Verify

```sh
node "$H/scripts/deck.mjs" verify            # structure, tags, catalog, exports
node "$H/scripts/deck.mjs" verify --remote   # plus HTTP checks on thumbnails
```

Every `FAIL` is a defect. `WARN` on a deck with zero slides and on remote-only thumbnails.

## References

- `references/deck-model.md` — JSON schema, tags, invariants, index format.
- `references/thumbnails.md` — YouTube endpoints, quality fallback, metadata, failure modes.
- `references/tags.md` — normalisation, tag view, rename/delete semantics, pitfalls.
- `references/google-slides.md` — OOXML package layout, import fidelity, troubleshooting.
- `references/publishing.md` — Pages, token setup, branch testing, skill sync.
