# Publishing and sync

## Private only

The collection bundles thumbnails owned by video creators. Keep the repository **private** and do not
enable GitHub Pages: a Pages site is public even when its repository is private, which would
redistribute every thumbnail.

Preview locally:

```sh
node scripts/deck.mjs serve        # http://localhost:4173/
```

No analytics, no external fonts, no CDN — the viewer works offline once the page is loaded.

## First push

```sh
cd ~/Projects/youtube-slide-decks
git init
git add -A
git commit -m "Add YouTube slide deck collection and skill"
gh repo create youtube-slide-decks --private --source . --remote origin --push
```

`gh auth login` first if `gh auth status` reports no host. Confirm afterwards:

```sh
gh repo view --json visibility,nameWithOwner
```

`visibility` must be `PRIVATE`.

## Skill installation

The repository copy under `skills/youtube-slide-decks/` is canonical. The installed copy under
`~/.config/opencode/skills/youtube-slide-decks/` is what OpenCode loads.

```sh
# repo → installed
rm -rf ~/.config/opencode/skills/youtube-slide-decks
cp -R skills/youtube-slide-decks ~/.config/opencode/skills/

# installed → repo (when editing the live skill)
rsync -a --delete ~/.config/opencode/skills/youtube-slide-decks/ skills/youtube-slide-decks/
```

Keep them identical; `scripts/deck.mjs` is a single file and diverging copies are the main maintenance
trap. The repository’s `scripts` symlink points into `skills/`, so `node scripts/deck.mjs` always runs
the canonical code.

## Updating the catalog page

The site is static and reads `decks/index.json`. After any manual filesystem change:

```sh
node scripts/deck.mjs rebuild
node scripts/deck.mjs verify
```

If Pages is ever enabled against a collection that contains no third-party images, publish from the
repository root and keep `.nojekyll` in place.

## Backup

The repository is the backup of deck data. Exports are rebuildable and intentionally untracked. If a
deck disappears, `git log -- decks/<id>` recovers it.
