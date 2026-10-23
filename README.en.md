# dsh-composer-scratchpad

English | [中文](README.md)

**A scratchpad pinned to the composer.** Click the pencil in the tool row and a plain
textarea opens: park the idea first, press Enter and it only breaks the line — it can
never be sent by accident. Move it into the input when you actually mean it.

![Panel and resize grip](screenshots/panel.png)

## What it is for

You have something to write but you have not decided whether to send it. Typing it
straight into the composer means one Enter publishes a half-finished thought; writing it
in a separate notes app means a context switch and a copy-paste later.

This plugin adds one entry to the **composer tool row**. The text lives only in your
browser's `localStorage`, **shared by every session** — switching sessions, switching
workspaces, reloading or restarting does not lose it.

## How it differs from a notes plugin

The ecosystem already has full notes plugins (file trees, tabs, Markdown preview) that
manage a folder of documents. This one does exactly one thing: **the sentence you have
not decided to send yet**. So it deliberately has no folders, no tags, no pages, and no
send button.

## Screenshots

| Panel | One-time resize hint |
| --- | --- |
| ![](screenshots/panel.png) | ![](screenshots/resize-hint.png) |

## Requirements

| Item | Requirement |
| --- | --- |
| Host | DSH web (`dsh web`) or the desktop app; the desktop app runs the same `profiles/web` set |
| DSH version | `>= 0.2.0` (see `engines.dsh`). Verified on `0.2.1-rc.2`; earlier versions are untested |
| Mount point | the client slot `conversation.input.right`, provided by `@deepseek-ai/dsh-client-ui-conversation` |
| Browser | any browser with `localStorage`; the embedded WebView of the desktop app works too |
| Node | `>= 18`, only for `npm test`; running the plugin needs none |
| Network | none. No dependencies, no build step, no requests |

If the pencil icon does not appear after installing, check these in order:

1. restart the kernel — the client module manifest is produced at boot, so a hot install
   does not enter it;
2. hard reload with `Ctrl+Shift+R` — the client bundle is served with
   `cache-control: immutable`, so an ordinary reload will not fetch it;
3. run `dsh plugin list --profile web` and confirm the plugin is really in `bundles`;
4. if none of the above, check your host version: does `conversation.input.right` still
   exist in it.

The panel colours are written for the dark theme only (see "Known limits"); on a light
theme it looks wrong, which is cosmetic and not a bad install.

## Install

The package is not on npm yet, so both ways below install from the GitHub source.

From the **Plugins** panel in the sidebar, add:

```
github:br0caz/dsh-composer-scratchpad
```

Or from a terminal:

```sh
dsh plugin --profile web add github:br0caz/dsh-composer-scratchpad
```

### From npm (once published)

After `dsh-composer-scratchpad` is published to npm, the bare package name works:

```sh
dsh plugin --profile web add dsh-composer-scratchpad
```

Restart the kernel afterwards — the client module manifest is produced at boot. When you
install from a source or local path and then edit `client.js`, also press
`Ctrl+Shift+R`: the client bundle is served with `cache-control: immutable`, so an
ordinary reload will not fetch it again.

## Usage

| Action | Result |
| --- | --- |
| Click the pencil | Open / close the panel |
| `Esc` or click outside | Close |
| `Enter` | **Line break only** — the key event is stopped inside the panel, so it never reaches the composer's submit path |
| Drag the corner grip | Drag left to widen, up to grow taller (the panel opens upward from the tool row) |
| Double-click the grip | Back to the default 380×220 |
| Dot on the icon | There is text inside |

The first time the panel opens, a small line reading “可拖动调整大小” (drag to resize)
fades out after 2.4 s. It is shown **until you actually resize**: once you have dragged it
stops forever; if you never drag, it appears at most three times.

## Where the data lives

| Keys | Content |
| --- | --- |
| `dsh-composer-scratchpad:*` (legacy `dsh-memo-pad:*`) | text, panel size, hint counter |

Written to `localStorage` only. No network calls, nothing is added to the conversation,
nothing is uploaded. Clearing site data loses it; use browser sync or export it yourself
if you need it elsewhere.

## Implementation

No build step, no dependencies:

- `client.js` — all logic and UI, hand-written `window.__ModuleLoader__.load({ id, factory })`,
  React comes from the host's module table via `require`, so no bundler and no React copy;
- mounted at the client slot `conversation.input.right` (composer tool row, left of the
  model selector). It does not take `conversation.input.activity`, which is a single-slot
  seat usually owned by the voice-input plugin;
- `index.js` — the host half, intentionally empty;
- `cordis.patch.yml` — lets a plugin manager mount it in one click;
- `tests/smoke.cjs` — seven assertions against a miniature React and DOM; `npm test`,
  no browser needed.

## Known limits

- The panel colours are hard-coded for the dark theme (`#2a2b2f`);
- One box, one document — that is the design, not an unfinished feature;
- The text never becomes a workspace file, so the agent cannot read it — on purpose: it is
  your scratch, not model context.

## License

MIT
