# Attribution

## Code

The viewer, CLI, and `.pptx` writer in this repository are original work for this project. No
third-party JavaScript, CSS, fonts, icons or build tooling are bundled. The runtime is Node.js in the
CLI and a modern browser for the site.

## Video thumbnails

Every image under `decks/*/thumbnails/` is a YouTube thumbnail uploaded by the channel that published
the video, retrieved from `i.ytimg.com`. Copyright remains with those creators. They are collected here
for reference, next to a link to the original video.

If you are a creator and want a thumbnail removed, open an issue or delete the slide with
`node scripts/deck.mjs remove "<deck>" <video-id>`. Removal is immediate on the next Pages deploy.

## Metadata

Titles, channel names, channel URLs and thumbnail URLs come from YouTube’s public oEmbed endpoint and
the public watch page. Duration is read from `lengthSeconds` on the watch page. No YouTube API key,
account data or analytics are used.

## Trademarks

“YouTube” is a trademark of Google LLC. This project is not affiliated with or endorsed by YouTube or
Google. No YouTube logos or brand assets are redistributed; the red play badge in the viewer is a
generic CSS shape.

## Licence

No licence is granted for the thumbnails, and none can be granted by this repository. The code is
published as-is, without warranty.
