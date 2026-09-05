---
title: slidev-pane
addons:
  - '@/.'
layout: center
class: text-center
drawings:
  persist: false
transition: slide-left
mdc: true
---

# slidev-pane

A PowerPoint-style slide pane for Slidev.

<div class="mt-10 text-sm opacity-70">Press <kbd>p</kbd> to open the pane.</div>

---

# Your deck, at a glance

Browse thumbnails on the left. Present the current slide on the right.

- Click a thumbnail to jump to any slide.
- Drag the divider to resize the pane.
- Press <kbd>g</kbd> to find a slide, or <kbd>o</kbd> for the overview.

<!--
Click a few thumbnails, then return here. Drag the divider to adjust the pane width.
-->

---
layout: section
---

# A new section

Keep related slides together in collapsible groups.

<!--
This slide uses layout: section. Try collapsing and expanding its group in the pane.
-->

---

# One step at a time

Your Slidev click animations work here, too.

<v-clicks>

- Start with an idea.
- Add a little context.
- Make your point.

</v-clicks>

<!--
Use the right arrow to reveal each point. Use the left arrow to step back.
-->

---
layout: two-cols
---

# Room for the details

Zoom in with the **− / +** controls.

Click the percentage to fit the slide again.

Speaker notes stay below the canvas.

::right::

<div class="pl-8 pt-8">

```ts
const talk = {
  slides: 'Markdown',
  pane: 'PowerPoint-style',
  ready: true,
}
```

</div>

<!--
Try zooming in on the code, then reset. Drag the notes divider to make more room for these notes.
-->

---
layout: center
class: text-center
---

# Same Slidev. Familiar pane.

<div class="mt-8"><kbd>p</kbd> Toggle pane · <kbd>g</kbd> Find a slide · <kbd>o</kbd> Overview</div>
