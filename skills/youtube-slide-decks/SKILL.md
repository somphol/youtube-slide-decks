---
name: YouTube Slide Decks
description: Turn YouTube links into a browsable deck of thumbnail slides — add videos to a named deck, create/list/rename/remove decks, preview locally, and export a .pptx that Google Slides can import. Use when the user pastes a YouTube URL and names a deck, or asks to manage a video slide-deck collection.
version: 1.0.0
---

# YouTube Slide Decks

A deck is a folder of plain JSON plus downloaded thumbnails. A static viewer shows one video per
slide and has an **Export .pptx** button; an exporter also writes the same widescreen PowerPoint file
with the thumbnail, title, channel, duration and a clickable YouTube link on every slide.

## When to use

- The user pastes a YouTube URL with a deck name: “Put this <url> in AI/ML Educational Video Slide deck”.
- The user wants to see, create, rename, reorder or prune decks.
- The user wants a PowerPoint file for Google Slides.
- The user asks to preview or publish the collection.

## The collection

Default home: `~/Projects/youtube-slide-decks` (override with `--home <dir>` or `DECK_HOME`).
Public site: `https://somphol.github.io/youtube-slide-decks/` (GitHub Pages, repository root).
The repository is the database:

```text
<home>/
├── decks/index.json                  generated catalog — never hand-edit
├── decks/<deck-id>/deck.json         one deck
├── decks/<deck-id>/thumbnails/       <videoId>.jpg
├── index.html, deck.html, assets/    static viewer
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
2. Add with `--create` so a new deck is made when nothing matches:

```sh
node "$H/scripts/deck.mjs" add "AI/ML Educational Video Slide deck" \
  "https://www.youtube.com/watch?v=I2QhfZ0aVmk" --create
```

3. If the name is ambiguous the command exits 2 and prints candidates. Show them, ask one short
   question, then re-run with the exact id.
4. Report: deck title, video title as fetched by oEmbed, slide count. Do not retype the title from
   the URL.
5. Optional preview: `node "$H/scripts/deck.mjs" serve` → <http://localhost:4173/>.

Adding several URLs at once is supported. Re-adding the same video is a no-op unless `--force`
(refresh metadata and thumbnail). `--note "..."` adds a visible note to the slide.

## Commands

| Command | Purpose |
| --- | --- |
| `list [--json]` | decks with id, title, slide count, updated date |
| `create "Title" [--description "..."]` | empty deck |
| `add "Deck" <url...> [--create] [--note "..."] [--force] [--hotlink]` | add videos, download thumbnails |
| `remove "Deck" <video-id\|url\|index>` | delete one slide and its thumbnail |
| `move "Deck" <video-id\|index> <position>` | reorder |
| `rename "Deck" "New title"` | rename, and re-slug the folder when free |
| `delete "Deck" --yes` | delete a whole deck |
| `export ["Deck" \| --all] [--out DIR]` | write `.pptx` |
| `rebuild` | regenerate `decks/index.json` |
| `verify [--remote]` | schema, thumbnails, catalog, exports |
| `serve [--port 4173]` | local viewer |

## Export to Google Slides

In the viewer, **Export .pptx** builds the file client-side and downloads `<deck-id>.pptx`. Tell the
user this is the normal path; nothing is uploaded.

From the CLI (bulk or scripted):

```sh
node "$H/scripts/deck.mjs" export "AI/ML Educational Video Slide deck"
```

Produces `exports/<deck-id>.pptx`; `exports/` is gitignored.

Either file imports the same way:

1. Google Drive → New → File upload → choose the `.pptx`.
2. Right-click → Open with → Google Slides (or Google Slides → File → Import slides for an existing
   presentation).

Export is repeatable; rerun after changing a deck.

## Rules

- Never edit `decks/index.json` by hand; run `rebuild`.
- Never invent thumbnails. Missing images fall back to a remote `i.ytimg.com` URL and `verify` warns.
- Keep deck ids lowercase kebab-case; the CLI handles this. Do not rename deck folders manually.
- `--hotlink` skips the download and stores the remote thumbnail URL. Use it only when storage matters.
- Thumbnails belong to their creators. Keep `ATTRIBUTION.md` accurate; when a creator asks for removal,
  delete the slide and push. The collection is public, so removal is immediate after deploy.
- Publish by pushing to `main`; Pages deploys the repository root. See `references/publishing.md`.

## Verify

```sh
node "$H/scripts/deck.mjs" verify            # local structure + catalog + exports
node "$H/scripts/deck.mjs" verify --remote   # plus HTTP checks on thumbnails
```

Every `FAIL` is a defect. `WARN` on a deck with zero slides and on remote-only thumbnails.

## References

- `references/deck-model.md` — JSON schema, invariants, index format, safe changes.
- `references/thumbnails.md` — YouTube endpoints, quality fallback, metadata, failure modes.
- `references/google-slides.md` — OOXML package layout, import fidelity, troubleshooting.
- `references/publishing.md` — public Pages deployment, MIME types, skill sync, backup.
