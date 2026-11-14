# PowerPoint export and Google Slides

## Two paths, one builder

- **Viewer:** the **Export .pptx** button fetches the thumbnails and calls `assets/pptx-core.mjs` in the
  browser, then downloads a Blob. No upload, no server.
- **CLI:** `node scripts/deck.mjs export` calls the same core, with a Node wrapper that reads local
  images and falls back to `i.ytimg.com`.

Because both routes share `pptx-core.mjs`, a change to geometry or XML is tested once and applies to
both. Keep that file free of `fs`, `path` and `Buffer`; use `Uint8Array` and the injected `getImage`.

## What the exporter writes

`export` builds a widescreen `.pptx` (13.333 × 7.5 in, `12192000 × 6858000` EMU) with one slide per
video:

- thumbnail embedded as `ppt/media/imageN.jpg`;
- kicker (`03 / 12  DECK TITLE`), title, channel · duration, optional note;
- “▶ Watch on YouTube” as a real external hyperlink, plus the plain URL underneath;
- the image itself is also clickable;
- dark background `0B0D10`, accent `FF3D3D`.

The ZIP is written stored (no compression) by `pptx.mjs`, so no `zip` binary or npm package is needed.
The part set is the minimum both PowerPoint and Google Slides accept: `[Content_Types].xml`,
`_rels/.rels`, `docProps/{core,app}.xml`, `ppt/presentation.xml` + rels, one slide master and one blank
layout with rels, one theme, then `ppt/slides/slideN.xml` + rels and the media.

## Validate without PowerPoint

```sh
unzip -t exports/<deck>.pptx
python3 -m venv .venv && .venv/bin/pip install python-pptx
.venv/bin/python -c "from pptx import Presentation; p=Presentation('exports/x.pptx'); print(len(p.slides))"
qlmanage -t -s 1400 -o /tmp/out exports/<deck>.pptx   # macOS Quick Look render
```

For the browser path, drive Chrome headless with `Browser.setDownloadBehavior`, click `#export`, and
validate the downloaded file with the same commands. That is how the viewer export was verified.

`python-pptx` accepts the package when every relationship resolves; Quick Look proves the shapes and
text actually draw. Neither proves Google Slides fidelity — that needs an upload.

## Google Slides import

1. Google Drive → New → File upload → select the `.pptx`.
2. Right-click the upload → Open with → Google Slides.
3. Or, inside an existing presentation: File → Import slides → Upload → select the `.pptx` → choose
   all slides.

Links survive as clickable hyperlinks on both the image and the “Watch on YouTube” run. Images are
copied into Google’s storage; the deck no longer depends on the local files.

## Known fidelity limits

- Theme fonts are Arial; Google may substitute, which changes line breaks.
- `normAutofit` is honoured by PowerPoint; Google Slides may clip a title of more than four lines.
  Titles are truncated at 180 characters to limit the damage.
- Rounded corners, shadows and the filmstrip belong to the HTML viewer only.
- A video is a thumbnail plus a link. Nothing embeds the player and nothing downloads the video.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| “The file is corrupt” | a slide rel points at a missing part | rerun `export`, then `verify` |
| blank slide | thumbnail fetch failed during export and no local file exists | `add --force` on that video, export again |
| link not clickable | `rId3` missing from slide rels | inspect `ppt/slides/_rels/slideN.xml.rels` |
| huge file | dozens of maxres thumbnails | expected; exports are gitignored |
