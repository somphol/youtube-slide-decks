# Publishing and sync

## Public by design

The collection is public on GitHub Pages: `https://somphol.github.io/youtube-slide-decks/`.
The repository root is the site; there is no build step and `.nojekyll` must stay in place.

Thumbnails are public with it. They remain the copyright of the channels that uploaded the videos and
are shown for reference next to the source link. Keep `ATTRIBUTION.md` accurate and honour removal
requests by deleting the slide.

## Deploy

```sh
cd ~/Projects/youtube-slide-decks
git add -A && git commit -m "…" && git push
```

Pages rebuilds from `main` automatically. Check the deployment:

```sh
gh api repos/somphol/youtube-slide-decks/pages/builds/latest --jq '.status'
curl -sI https://somphol.github.io/youtube-slide-decks/ | head -1
```

First-time setup used the API:

```sh
gh api -X POST repos/somphol/youtube-slide-decks/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

## MIME types

GitHub Pages serves `.mjs` as JavaScript, so the viewer’s `import './pptx-core.mjs'` works. The local
server in `deck.mjs` must keep the `.mjs` entry in its MIME map; without it the module is served as
`application/octet-stream` and the whole viewer fails silently.

## Skill installation

The repository copy under `skills/youtube-slide-decks/` is canonical. The installed copy under
`~/.config/opencode/skills/youtube-slide-decks/` is what OpenCode loads.

```sh
npm run install-skill          # repo → installed, replaces the installed copy

# installed → repo (when editing the live skill)
rsync -a --delete ~/.config/opencode/skills/youtube-slide-decks/ skills/youtube-slide-decks/
```

Keep them identical. The repository’s `scripts` symlink points into `skills/`, so
`node scripts/deck.mjs` always runs the canonical code.

## Updating the viewer

Root `index.html`, `deck.html`, `assets/` are copies of the skill template. Edit
`skills/youtube-slide-decks/assets/site/`, then:

```sh
npm run sync-site
node scripts/deck.mjs verify
```

## Backup

The repository is the backup of deck data. Exports are rebuildable and intentionally untracked. If a
deck disappears, `git log -- decks/<id>` recovers it.
