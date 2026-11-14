# Tags

## Model

Each slide may carry `tags`, an array of strings:

```json
{ "videoId": "I2QhfZ0aVmk", "tags": ["llm", "inference", "serving"] }
```

The catalog keeps a tally so the tags page needs one request:

```json
"tags": [{ "name": "inference", "count": 1 }, { "name": "llm", "count": 1 }]
```

Normal form: lowercase, `a-z0-9-`, maximum 24 characters, maximum 8 tags per slide, no duplicates.
`assets/tags.mjs` is the single implementation, imported by the browser and the CLI:

```js
normalizeTag('  #LLM Serving ') // → 'llm-serving'
normalizeTags('a, a, B')        // → ['a', 'b']
tallyTags(decks)                // → [{ name, count }] sorted by count, then name
```

Input accepts commas, spaces around commas, leading `#`, and mixed case. Anything else is reduced to
separators, so “AI/ML” becomes `ai-ml`.

## Tag view

`deck.html?tag=llm` loads the catalog, fetches every `deck.json`, flattens slides whose `tags` include
the tag, and attaches the source deck id/title to each slide copy as `_deckId` / `_deckTitle`. The rest
of the viewer is unchanged: arrows, filmstrip, grid, export, delete and retag all work.

Consequences:

- Thumbnails resolve against the source deck (`_deckId`), not the virtual deck id.
- Deleting or retagging from the tag view targets the source deck.
- Retagging a slide so it no longer matches the current tag removes it from the view.
- The virtual deck id is `tag-<name>`, so export produces `tag-llm.pptx`.

## Rename and delete

Both operations run in `mutations.js`:

1. Read the catalog and every deck.
2. Rewrite `slide.tags` on matching slides. Rename merges into an existing tag instead of duplicating.
3. Recompute the entire tally with `tallyTags`.
4. Commit every changed `deck.json` plus `index.json` in one commit.

Rename is idempotent if the target equals the source. Delete leaves the videos untouched, only the
tags disappear.

## Pitfalls

- **Counts are derived.** Browser writes adjust counts by delta for add/delete/retag; a full rebuild is
  the source of truth. If a count looks wrong, run `rebuild`.
- **Case is folded at write time.** `LLM` and `llm` become one tag; do not reintroduce display case.
- **Empty tags are dropped.** A tag made only of punctuation normalises to nothing and is ignored.
- **The tag page caches nothing.** It fetches the catalog with `no-store`; after a write, reload to see
  other clients’ changes.
- **Do not store tags at deck level.** A tag applies to a video, and the same video can appear in
  several decks; the tally counts each occurrence.
