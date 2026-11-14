# YouTube thumbnails and metadata

## Metadata

`GET https://www.youtube.com/oembed?url=<watch-url>&format=json` returns `title`, `author_name`,
`author_url` and a `thumbnail_url`. No API key, no quota. Use it as the source of truth for the title
and channel; do not derive either from the URL.

Duration is not in oEmbed. The watch page contains `"lengthSeconds":"3462"`; a single HTML fetch
recovers it. Treat failure as normal (`durationSeconds: null`) — a slide without a duration is valid.

## Thumbnails

```text
https://i.ytimg.com/vi/<videoId>/maxresdefault.jpg   1280×720, not always present
https://i.ytimg.com/vi/<videoId>/sddefault.jpg        640×480
https://i.ytimg.com/vi/<videoId>/hqdefault.jpg        480×360, always present
```

Try in that order. Two traps:

1. A missing `maxresdefault` can answer `200` with a small grey placeholder instead of `404`.
2. `sddefault` is 4:3 with letterboxing; `maxresdefault` and `hqdefault` are 16:9.

The CLI requires `status === 200` and at least 9,000 bytes before accepting a download, which rejects
the placeholder. It saves `<videoId>.jpg` and records `thumbnailQuality`.

`--hotlink` skips downloading and stores `thumbnailUrl` instead. The viewer then loads from
`i.ytimg.com`. This avoids storing images but breaks offline viewing and depends on YouTube keeping
the file.

## Failure modes

| Symptom | Meaning | Action |
| --- | --- | --- |
| `400` from oEmbed | private, removed or age-gated video | report, do not create a slide |
| title = `YouTube video <id>` | oEmbed failed | slide is still usable; reopen later with `add --force` |
| no local image, remote URL set | all qualities failed | `verify` warns; retry with `--force` |
| `429` | rate limiting | add one URL at a time, wait a minute |

## Legality

Thumbnails are uploaded by channel owners and remain their copyright. Downloading them for a private
reference deck is one thing; republishing them on a public site is another. Do not enable GitHub Pages
for a collection that bundles thumbnails, and do not copy the images into a public repository.
