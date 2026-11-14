# YouTube Slide Decks

A private collection of YouTube videos arranged as slide decks. Each slide is a video thumbnail with
its title, channel, duration and a link back to YouTube. A static viewer steps through a deck; an
export command writes a `.pptx` that Google Slides imports.

This is a personal reference library, not a video host. Nothing downloads video and nothing is
published publicly.

## Quick start

```sh
npm run list          # decks in the collection
npm run serve         # viewer at http://localhost:4173/
```

Add a video:

```sh
node scripts/deck.mjs add "AI/ML Educational Video Slide deck" \
  "https://www.youtube.com/watch?v=I2QhfZ0aVmk" --create
```

Or ask OpenCode: *“Put this https://youtu.be/… into AI/ML Educational Video Slide deck.”* The
`youtube-slide-decks` skill in `skills/` handles the lookup, thumbnail, metadata and reporting.

## Commands

| Command | Purpose |
| --- | --- |
| `node scripts/deck.mjs list [--json]` | decks, ids, slide counts |
| `node scripts/deck.mjs create "Title" [--description "..."]` | new empty deck |
| `node scripts/deck.mjs add "Deck" <url...> [--create] [--note "..."] [--force] [--hotlink]` | add videos |
| `node scripts/deck.mjs remove "Deck" <video-id\|url\|index>` | drop a slide |
| `node scripts/deck.mjs move "Deck" <video-id\|index> <position>` | reorder |
| `node scripts/deck.mjs rename "Deck" "New title"` | rename |
| `node scripts/deck.mjs delete "Deck" --yes` | delete a deck |
| `node scripts/deck.mjs export ["Deck" \| --all] [--out DIR]` | write `.pptx` |
| `node scripts/deck.mjs rebuild` | regenerate `decks/index.json` |
| `node scripts/deck.mjs verify [--remote]` | validate everything |
| `node scripts/deck.mjs serve [--port 4173]` | local viewer |

Global flags: `--home <dir>` or `DECK_HOME`. Without either, the current directory is used when it
contains `decks/`, otherwise `~/Projects/youtube-slide-decks`.

## Export for Google Slides

```sh
node scripts/deck.mjs export --all
```

Files land in `exports/<deck-id>.pptx` (gitignored). Import with Google Drive → New → File upload →
Open with → Google Slides, or File → Import slides inside an existing presentation.

Each slide carries the thumbnail, title, channel, duration, the deck title as a kicker, and two
clickable paths to the video: the image and the “Watch on YouTube” line.

## Layout

```text
.
├── decks/
│   ├── index.json                  generated catalog
│   └── <deck-id>/
│       ├── deck.json               deck metadata and slides
│       └── thumbnails/<id>.jpg
├── index.html                      deck browser
├── deck.html                       slide viewer (?deck=<id>&slide=<n>)
├── assets/                         viewer CSS and JS, no dependencies
├── exports/                        .pptx output, gitignored
├── scripts -> skills/youtube-slide-decks/scripts
└── skills/youtube-slide-decks/     the skill (SKILL.md, references, assets/site, scripts)
```

## Viewer

- Arrow keys, space, Home/End, `g` for the grid, `f` for fullscreen, `Esc` to close the grid.
- Swipe left/right on touch devices.
- Deep links: `deck.html?deck=ai-ml-educational-videos&slide=3`.
- Dark and light themes follow the system setting.
- No fonts, scripts or images are fetched from third parties; thumbnails are local.

## Verification

```sh
node scripts/deck.mjs verify            # structure, catalog, exports
node scripts/deck.mjs verify --remote   # plus thumbnail HTTP checks
```

## Privacy

The repository is private on purpose. Thumbnails are the copyright of the channels that uploaded
them, so GitHub Pages is deliberately not enabled — a Pages site is public even for a private repo.
Preview locally instead. See [ATTRIBUTION.md](ATTRIBUTION.md).
