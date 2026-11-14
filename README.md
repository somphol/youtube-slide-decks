# YouTube Slide Decks

A public collection of YouTube videos arranged as slide decks. Each slide is a video thumbnail with
its title, channel, duration, tags and a link back to YouTube. A static viewer steps through a deck and
can **export a .pptx**, **add a video**, **delete a video**, and **edit tags** — writes go straight to
GitHub through the API. A tag page groups videos across decks.

Live site: **https://somphol.github.io/youtube-slide-decks/**

![Deck viewer](docs/deck.png)

This is a reference library, not a video host. Nothing downloads video.

## Viewer

- Arrow keys, space, Home/End, `g` for the grid, `f` for fullscreen, `Esc` to close the grid.
- Swipe left/right on touch devices.
- Deep links: `?deck=ai-ml-educational-videos&slide=3`, `?tag=llm&slide=2`.
- Dark and light themes follow the system setting.
- **Export .pptx** downloads the current deck; import it with Google Drive → Open with → Google Slides.

## Writing from the browser

Adding, deleting and retagging commit to this repository. A static page cannot write on its own, so
the site uses a GitHub token:

1. Create a **fine-grained token** at GitHub → Settings → Developer settings → Fine-grained tokens.
2. Scope it to `somphol/youtube-slide-decks` with **Contents: Read and write**.
3. Open any deck, press **+ Add video** (or Delete / ＋ Tag); the site asks for the token once.
4. The token is stored in that browser’s `localStorage` and sent only to `api.github.com`. **Forget
   token** is in the same dialog.

Each action is one commit: `deck.json`, the catalog, and the thumbnail when it changes. GitHub Pages
redeploys in about a minute; the viewer updates immediately for the action you just made.

## Tags

- Add tags in the add dialog, or press **＋ Tag** on a slide. Comma separated, lowercase, up to 8.
- Every tag chip links to `/deck.html?tag=<name>`: a virtual deck of every video with that tag across
  all decks, with the same arrows, filmstrip and export.
- `/tags.html` lists all tags. Rename and delete there; both rewrite every affected deck in one commit.

## Add from the CLI

```sh
node scripts/deck.mjs add "AI/ML Educational Video Slide deck" \
  "https://www.youtube.com/watch?v=I2QhfZ0aVmk" --tag "llm, inference" --create
```

Or ask OpenCode: *“Put this https://youtu.be/… into AI/ML Educational Video Slide deck.”* The
`youtube-slide-decks` skill in `skills/` handles the lookup, thumbnail, metadata and reporting.

## Commands

| Command | Purpose |
| --- | --- |
| `node scripts/deck.mjs list [--json]` | decks, ids, slide counts |
| `node scripts/deck.mjs create "Title" [--description "..."]` | new empty deck |
| `node scripts/deck.mjs add "Deck" <url...> [--create] [--note "..."] [--tag "a,b"] [--force]` | add videos |
| `node scripts/deck.mjs remove "Deck" <video-id\|url\|index>` | drop a slide |
| `node scripts/deck.mjs tag "Deck" <video-id\|index> "a,b"` | replace a slide’s tags |
| `node scripts/deck.mjs move "Deck" <video-id\|index> <position>` | reorder |
| `node scripts/deck.mjs rename "Deck" "New title"` | rename |
| `node scripts/deck.mjs delete "Deck" --yes` | delete a deck |
| `node scripts/deck.mjs export ["Deck" \| --all] [--out DIR]` | write `.pptx` from the CLI |
| `node scripts/deck.mjs rebuild` | regenerate `decks/index.json` (including the tag tally) |
| `node scripts/deck.mjs verify [--remote]` | validate everything |
| `node scripts/deck.mjs serve [--port 4173]` | local viewer |

Global flags: `--home <dir>` or `DECK_HOME`. Without either, the current directory is used when it
contains `decks/`, otherwise `~/Projects/youtube-slide-decks`.

## Layout

```text
.
├── decks/
│   ├── index.json                  generated catalog + tag tally
│   └── <deck-id>/
│       ├── deck.json               deck metadata and slides (tags live here)
│       └── thumbnails/<id>.jpg
├── index.html                      deck browser
├── deck.html                       slide viewer (?deck= or ?tag=)
├── tags.html                       tag manager
├── assets/
│   ├── app.js                      viewer, export, add/delete/tag wiring
│   ├── add.js  connect.js  dialogs.js
│   ├── github.js                   REST API + single-commit writer
│   ├── mutations.js                add, delete, retag, rename/delete tag
│   ├── tags.js                     tag page
│   ├── tags.mjs                    tag normalisation + tally (shared with CLI)
│   └── pptx-core.mjs               OOXML/ZIP builder (shared with CLI)
├── exports/                        CLI .pptx output, gitignored
├── scripts -> skills/youtube-slide-decks/scripts
└── skills/youtube-slide-decks/     the skill (SKILL.md, references, assets/site, scripts)
```

## Verification

```sh
node scripts/deck.mjs verify            # structure, tags, catalog, exports
node scripts/deck.mjs verify --remote   # plus thumbnail HTTP checks
```

## Documentation

- [AGENTS.md](AGENTS.md) — handoff for another agent: commands, architecture, constraints.
- [docs/prompts.md](docs/prompts.md) — the prompts that built this app, for reference.
- [ATTRIBUTION.md](ATTRIBUTION.md) — thumbnails, metadata, trademarks.

## Thumbnails and attribution

Thumbnails are uploaded by the channels that published the videos and remain their copyright. They
appear here for reference alongside a link to the original video. If a creator asks for removal, delete
the slide with **Delete** or `remove`. See [ATTRIBUTION.md](ATTRIBUTION.md).
