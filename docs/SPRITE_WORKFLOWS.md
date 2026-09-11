# DeskBuddy sprite workflow

DeskBuddy does not generate art. Every buddy uses the frames that its creator imports or draws inside the app.

## Import a sheet

Export one **transparent PNG** with equally sized cells. After upload, DeskBuddy offers square-cell grid choices. Choose the grid that keeps one whole character in a cell, then configure the idle and walk rows, **starting columns**, and frame counts.

For example, this 4 × 2 arrangement gives both animations four frames:

| Row | Cells | Animation setting |
| --- | --- | --- |
| 1 | `idle-1`, `idle-2`, `idle-3`, `idle-4` | Idle row 1, 4 frames |
| 2 | `walk-1`, `walk-2`, `walk-3`, `walk-4` | Walk row 2, 4 frames |

The app crops each complete cell into a separate PNG, stores the idle and walk clips locally, and flips the walk frames automatically when the buddy moves left. It never trims to a character's visible pixels, so a sword, tail, or feet at the cell edge stay inside the frame.

### Common layouts

| Sheet | Choose in DeskBuddy | Clip settings |
| --- | --- | --- |
| Four-frame horizontal strip, `1024 × 256` | `4 × 1 · 256px` | Set both clips to row 1, start column 1, 4 frames when you have one loop. |
| Dense `384 × 256` pixel-art sheet | `12 × 8 · 32px` | Pick the row and start column for one character's sequence; for a three-frame sequence, use 3 frames. |

### Source-image rules

- Use PNG, not JPG, WebP, or a screenshot.
- Keep a real transparent background; a grey checkerboard drawn into the image is still a solid background.
- Do not include titles, labels, grid borders, watermarks, or outer margins in the sheet.
- Make every cell the same width and height.
- Up to 8 frames can be used for idle and up to 8 for walk.

If you only have an idle loop, set both the Idle row and Walk row to the same row, and give them the same starting column and frame count. The buddy will still move, using that animation for both states until you draw or import a dedicated walk loop.

## Draw frames inside DeskBuddy

1. Choose **Draw your own**.
2. Select `Idle`, draw frame 1, and use **Add frame** for additional idle poses.
3. Select `Walk`, draw at least one moving pose, and add frames for a loop.
4. Use the color control, brush-size slider, and eraser as needed. **Previous frame** shows the last frame behind the canvas at a chosen onion-skin opacity, helping line up the next pose.
5. Choose **Create & launch**.

The canvas is 160 × 160 pixels and begins completely transparent. Use the checkerboard only as a visual guide—it is never saved into the sprite. The onion-skin reference is also a separate layer and is never saved into the active frame.

## When each animation plays

| Buddy state | Frames played |
| --- | --- |
| Waiting | Idle |
| Gliding around the desktop | Walk |
| Being dragged | Walk |
| Reduced-motion setting enabled | First frame only |
