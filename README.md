# slidev-pane

PowerPoint-style pane presenter for Slidev.

## What it does

- Adds a dedicated `/pane-presenter/:no` page with a two-pane layout.
- Left side shows slide thumbnails.
- Right side shows the active slide.
- Keeps Slidev's built-in presenter mode intact.
- Adds a `Pane` entry to Slidev's standard nav controls.
- Adds a `p` shortcut to toggle this presenter mode.

## Usage

Install the addon in your Slidev project:

```bash
pnpm add -D slidev-pane
```

Then add it to the deck's `package.json`:

```json
{
  "slidev": {
    "addons": ["slidev-pane"]
  }
}
```

Press `p` to enter or leave the pane presenter mode.

## Notes

- This addon keeps Slidev's built-in `/presenter/:no` route unchanged.
- The pane presenter lives at `/pane-presenter/:no`.
- It keeps `o` for Slidev's quick overview instead of rebinding it.
- The implementation depends on Slidev client internals.
- The package metadata now keeps a minimum Slidev version of `0.51.0-beta.4`, but no longer hard-pins a single `0.51.x` range.
