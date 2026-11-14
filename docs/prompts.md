# The prompts that built this app

For educational use: this file records the actual request sequence that produced the collection, the
viewer, the export path and the write actions. Prompts are verbatim (including the original spelling).
Each section notes what the prompt changed and where that decision lives in the repository.

## 1. The starting request

> Can you add a skill for me so that I can give the Youtube video and the skill take the thumbnail of
> the video and add that into a slide deck along with the link to the video?
>
> I can create new slide deck and I can ask for the list of existing slide deck, etc.
>
> For example,
>
> Put this https://www.youtube.com/watch?v=I2QhfZ0aVmk to AI/ML Educational Video Slide deck.
>
> We can then publish both skill and the collectoin of slide decks as a repo on GitHub?

**What it established:** a skill as the authoring interface; decks addressed by natural-language name;
thumbnails and links as the core content; GitHub as the distribution channel.

**Where it lives:** `skills/youtube-slide-decks/SKILL.md`, `decks/<id>/deck.json`, the `add` command,
and the fuzzy deck-name resolver (`add "AI/ML Educational Video Slide deck" --create`).

## 2. The platform question

> BTW, can you make it into a HTML based web app?
>
> I still don't know how you would store the information as well as how to create the HTML slide deck,
> so I am open for suggestion.
>
> Is doing HTML-based web app vs Mac app, which one is easier for you?

**What it established:** HTML over a native Mac app; JSON on disk as the database; a static viewer that
reads two files. This is the decision that made GitHub Pages possible.

**Where it lives:** `decks/`, `decks/index.json`, `index.html`, `deck.html`, `assets/app.js`.

## 3. Export

> Tell you what it would be great to be able to export the deck so it can be imported by Google Slides
> later.
>
> I think the deck is best kept as private consumption

**What it established:** `.pptx` as the interchange format (Google Slides imports it, HTML it does
not); the first pass treated the collection as private.

**Where it lives:** `assets/pptx-core.mjs`, `scripts/pptx.mjs`, `export` command.

## 4. Correcting the visibility

> No, no, the repo can be public, but I think the slide is for user to view themselves, so we need a
> way for user to export the slide

**What it established:** public repository and site; export must work for a visitor with no toolchain,
which ruled out a CLI-only export and led to the in-browser exporter.

**Where it lives:** GitHub Pages deployment, the **Export .pptx** button, `Browser.setDownloadBehavior`
verification in `references/google-slides.md`.

## 5. Browser writes

> Can we have a button to add new video too?

**What it established:** write access from a static page, which has no server. The answer is the GitHub
REST API with a fine-grained token in `localStorage`, committing `deck.json` + thumbnail + catalog in
one commit.

**Where it lives:** `assets/github.js`, `assets/connect.js`, `assets/mutations.js`, `assets/add.js`.

## 6. Delete and tags

> Can we also add a way to delete a youtube video?
>
> And bonus point, allow user to tag video with different tags and we have a page to manage tags, and
> when a tag is clicked show the list of videos with that tag as a slide with back and forward control,
> etc.

**What it established:** tag arrays on slides; a catalog-level tag tally; a tags page for rename and
delete; tag results rendered through the existing deck viewer (`deck.html?tag=…`) so navigation,
filmstrip and export are reused rather than rebuilt.

**Where it lives:** `assets/tags.mjs`, `assets/tags.js`, `tags.html`, `tags` in `deck.json` and
`decks/index.json`.

## 7. This document

> And, for educational purpose, can you also add a doc to hold the prompt that I gave you that allow
> you to build this app too

**What it established:** prompts are part of the project record, not just the chat.

**Where it lives:** this file, linked from `README.md` and `AGENTS.md`.

## What the sequence teaches

- **Each prompt removed an assumption.** “Make it HTML” removed the native app; “repo can be public”
  removed the private-only design; “button to add” removed the CLI-only authoring model.
- **The storage choice survived every change.** JSON + files worked for the CLI, the browser, the
  exporter and the tag index because nothing depended on a server.
- **One shared core beats parallel implementations.** `pptx-core.mjs` serves the CLI and the browser;
  `tags.mjs` serves the mutations and the CLI. Keep new behaviour in a shared module.
- **Static sites can write, with a deliberate trade-off.** The token lives in one browser and can only
  touch one repository. That is the whole security model — state it plainly in the UI.
- **Verification is part of the feature.** Each prompt was answered with a headless check: the live
  export, the commit on a test branch, the tag view across decks.

## Replay

To reproduce the project from these prompts on a fresh machine, give the prompts in order to an agent
with this repository checked out, or start from `SKILL.md` and `AGENTS.md` directly. The authoritative
state is always the repository, not this transcript.
