# Deck model

## Files

`decks/<deck-id>/deck.json`:

```json
{
  "id": "ai-ml-educational-videos",
  "title": "AI/ML Educational Videos",
  "description": "Talks and explainers.",
  "createdAt": "2026-11-14T05:20:00.000Z",
  "updatedAt": "2026-11-14T05:24:00.000Z",
  "slides": [
    {
      "id": "I2QhfZ0aVmk",
      "type": "video",
      "videoId": "I2QhfZ0aVmk",
      "url": "https://www.youtube.com/watch?v=I2QhfZ0aVmk",
      "title": "Give Me 1 Hour, I'll Make LLM Inference Engines Click Forever",
      "author": "Zachary Huang",
      "authorUrl": "https://www.youtube.com/@ZacharyLLM",
      "durationSeconds": 3462,
      "duration": "57:42",
      "thumbnail": "thumbnails/I2QhfZ0aVmk.jpg",
      "thumbnailUrl": null,
      "thumbnailQuality": "maxresdefault",
      "tags": ["llm", "inference"],
      "note": "",
      "addedAt": "2026-11-14T05:24:00.000Z"
    }
  ]
}
```

`decks/index.json` is generated from the folders:

```json
{
  "generatedAt": "...",
  "decks": [
    {
      "id": "ai-ml-educational-videos",
      "title": "AI/ML Educational Videos",
      "description": "...",
      "slideCount": 1,
      "createdAt": "...",
      "updatedAt": "...",
      "cover": "thumbnails/I2QhfZ0aVmk.jpg",
      "coverVideoId": "I2QhfZ0aVmk"
    }
  ],
  "tags": [
    { "name": "inference", "count": 1 },
    { "name": "llm", "count": 1 }
  ]
}
```

`cover` and every `thumbnail` are relative to the deck folder. `tags` at the top level is computed by
`tallyTags`; never edit it by hand, and never store tags on a deck.

## Invariants

- `deck.id` equals the directory name. `rename` moves the folder and the viewer follows `index.json`.
- `slugify` produces `[a-z0-9-]`, max 60 characters; ids stay stable until a rename.
- Video ids are exactly 11 characters of `[A-Za-z0-9_-]`.
- A video appears at most once per deck. The same video may appear in several decks; each deck keeps
  its own copy of the image under its own thumbnail folder.
- `slides` order is presentation order. `add` appends; `move` rewrites the array.
- `tags` are lowercase kebab, max 24 characters, max 8 per slide, unique. `normalizeTags` in
  `assets/tags.mjs` is the only implementation. `decks/index.json` carries the derived tally.
- `decks/index.json` is rebuilt on every mutation; deleting a slug from disk is enough to drop a deck
  after `rebuild`, but prefer `delete --yes` so the images go too.
- Timestamps are ISO 8601 UTC strings.

## Changing the schema

Add fields with defaults on read (`slide.note || ''`), so old decks keep working. When a new field is
required, write a migration in `deck.mjs` that rewrites every `deck.json` once, and bump the skill
version. Never reorder existing keys in a way that makes diffs unreadable; sorted, stable output is the
reason the repository is reviewable.

## Why JSON and not a database

- Readable diffs and trivial recovery from git.
- No server, no lock-in, no migration tooling.
- The viewer fetches two static files; the whole site works from any static host.
- The cost is full-file rewrites, which are irrelevant at hundreds of slides.
