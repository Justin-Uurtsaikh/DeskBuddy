# DeskBuddy

DeskBuddy is a local-first **sprite-buddy creator**. Make a tiny animated companion from your own art, then let it float above your Mac or Windows desktop. It plays your idle frames while resting and your walk frames while you drag it or it glides around.

## Project website

The static DeskBuddy website lives in [`docs/`](docs/index.html), with a visitor-friendly [sprite and setup guide](docs/guide/index.html). It uses plain HTML, CSS, and JavaScript with no build step or third-party assets.

To publish it after pushing this repository to GitHub, open **Settings → Pages**, choose **Deploy from a branch**, then select the `main` branch and `/docs` folder.

## What makes it portfolio-worthy

- A polished Electron desktop app, not just a static web mockup.
- Two real animation-creation paths: import a sprite sheet or draw frame-by-frame in the app.
- Local-only sprite storage and persistence—no accounts, cloud generation, API keys, or AI service.
- Separate trusted main and renderer processes using Electron context isolation, sandboxing, and a small IPC API.
- Transparent, frameless, always-on-top companion windows with drag controls and reduced-motion support.

## Run it on Mac or Windows

1. Install [Node.js](https://nodejs.org/) (version 22.12 or later). On Mac, Electron 44 requires macOS 13 or later.
2. Open Terminal (Mac) or PowerShell (Windows) in this `deskbuddy` folder.
3. Run:

   ```sh
   npm install
   npm run dev
   ```

4. Choose **Import sprite sheet** or **Draw your own**, then select **Create & launch**.

The buddy appears as only your transparent sprite—no border, white card, hover buttons, heart, or exit control. Drag the sprite itself anywhere. It switches to its walk frames while moving and returns to its idle frames when it stops. With multiple buddies open, each one wanders on its own staggered schedule and picks a different recent direction.

## Make a sprite

### Import a sprite sheet

DeskBuddy accepts a **transparent PNG only**. After upload, it shows square-cell grid choices such as `4 × 1 · 256px` or `12 × 8 · 32px`. Pick the one that puts one complete character in each cell, then choose each clip's row, starting column, and frame count. A common layout is four idle frames on row 1 and four walk frames on row 2.

The source must be the clean PNG sprite sheet—not a screenshot with a checkerboard background, labels, grid lines, borders, or a white background. JPG and WebP files are deliberately rejected because they cannot reliably preserve transparency.

### Draw one in DeskBuddy

Switch to **Draw your own**. Choose a brush color and size, draw the current frame, then use **Add frame** for the next pose. Make at least one visible `Idle` frame and one visible `Walk` frame. The canvas is transparent from the start, and the eraser restores transparency. Turn on **Previous frame** to see a semi-transparent onion-skin reference while drawing the next frame; it is never saved into your art.

For the full workflow and layout examples, see [`docs/SPRITE_WORKFLOWS.md`](docs/SPRITE_WORKFLOWS.md).

## Create an app file

After `npm install`, run:

```sh
npm run dist
```

On Windows, the portable `.exe` is created in `release/`. On a Mac, a `.dmg` is created there instead.

## Privacy and safety choices

- Sprites are copied into DeskBuddy's private app-data folder; nothing is uploaded.
- Only PNGs with real transparent pixels and visible artwork are accepted.
- Each source image is limited to 5 MB and 16 megapixels. Animation sets are limited to eight frames per clip and 12 MB total.
- The renderer cannot access Node.js or your file system directly.

## Development check

```sh
npm run check
```

This project includes source code only. Run it on your Mac or Windows desktop to test the transparent companion window, then package it with `npm run dist`.
