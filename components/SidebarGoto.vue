<script setup lang="ts">
import TitleRenderer from '#slidev/title-renderer'
import Fuse from 'fuse.js'
import { computed, ref, watch } from 'vue'
import { activeElement, showGotoDialog } from '@slidev/client/state/index.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'

const container = ref<HTMLDivElement>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLDivElement>()
const items = ref<HTMLLIElement[]>()
const text = ref('')
const selectedIndex = ref(0)

const { slides } = useNav()
const { goSidebar } = useSidebarPresenterNav()

function notNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

const fuse = computed(() => new Fuse(slides.value.map(i => i.meta?.slide).filter(notNull), {
  keys: ['no', 'title'],
  threshold: 0.3,
  shouldSort: true,
  minMatchCharLength: 1,
}))

const path = computed(() => text.value.startsWith('/') ? text.value.substring(1) : text.value)
const hasQuery = computed(() => path.value.trim().length > 0)
const result = computed(() => {
  if (!hasQuery.value)
    return []
  return fuse.value.search(path.value).map(result => result.item)
})
const valid = computed(() => !!result.value.length)

function close() {
  text.value = ''
  showGotoDialog.value = false
}

function goTo() {
  if (valid.value) {
    const item = result.value[selectedIndex.value]
    if (item)
      goSidebar(item.no)
  }
  close()
}

function moveSelection(direction: -1 | 1) {
  const count = result.value.length
  if (!count) {
    selectedIndex.value = 0
    return
  }

  selectedIndex.value = (selectedIndex.value + direction + count) % count
  scroll()
}

function focusDown(event: KeyboardEvent) {
  event.preventDefault()
  moveSelection(1)
}

function focusUp(event: KeyboardEvent) {
  event.preventDefault()
  moveSelection(-1)
}

function scroll() {
  const item = items.value?.[selectedIndex.value]
  if (item && list.value) {
    if (item.offsetTop + item.offsetHeight > list.value.offsetHeight + list.value.scrollTop) {
      list.value.scrollTo({
        behavior: 'smooth',
        top: item.offsetTop + item.offsetHeight - list.value.offsetHeight + 1,
      })
    }
    else if (item.offsetTop < list.value.scrollTop) {
      list.value.scrollTo({
        behavior: 'smooth',
        top: item.offsetTop,
      })
    }
  }
}

function updateText(event: Event) {
  selectedIndex.value = 0
  text.value = (event.target as HTMLInputElement).value
}

function select(no: number) {
  goSidebar(no)
  close()
}

watch(showGotoDialog, async (show) => {
  if (show) {
    text.value = ''
    selectedIndex.value = 0
    setTimeout(() => input.value?.focus(), 0)
  }
  else {
    input.value?.blur()
  }
})

watch(activeElement, () => {
  if (!container.value?.contains(activeElement.value as Node))
    close()
})
</script>

<template>
  <div
    id="slidev-goto-dialog"
    ref="container"
    class="pane-goto"
    :class="{ 'is-open': showGotoDialog }"
    role="dialog"
    aria-label="Go to slide"
    :aria-hidden="!showGotoDialog"
  >
    <div class="pane-goto__field">
      <label for="slidev-goto-input">Go to slide</label>
      <div class="pane-goto__input-line" :class="{ 'is-invalid': !valid && text }">
        <input
          id="slidev-goto-input"
          ref="input"
          :value="text"
          type="text"
          :disabled="!showGotoDialog"
          :aria-invalid="Boolean(!valid && text)"
          autocomplete="off"
          spellcheck="false"
          placeholder="Number or title"
          @keydown.enter="goTo"
          @keydown.escape="close"
          @keydown.down="focusDown"
          @keydown.up="focusUp"
          @input="updateText"
        >
      </div>
    </div>
    <div
      v-if="result.length > 0"
      ref="list"
      class="pane-goto__results"
    >
      <ul>
        <li
          v-for="(item, index) of result"
          ref="items"
          :key="item.id"
          :class="{ 'is-selected': selectedIndex === index }"
        >
          <button
            type="button"
            @focus="selectedIndex = index"
            @click.stop.prevent="select(item.no)"
          >
            <span>{{ String(item.no).padStart(2, '0') }}</span>
            <TitleRenderer :no="item.no" />
          </button>
        </li>
      </ul>
    </div>
    <p v-else-if="text" class="pane-goto__empty">
      No slide matches “{{ text }}”
    </p>
  </div>
</template>

<style scoped>
.pane-goto {
  --goto-paper: #f8f9f6;
  --goto-ink: #202925;
  --goto-soft: #68736e;
  --goto-faint: #919a95;
  --goto-line: rgba(32, 41, 37, 0.1);
  --goto-line-strong: rgba(32, 41, 37, 0.19);
  --goto-sage: #6f8980;
  --goto-sage-soft: rgba(111, 137, 128, 0.1);
  --goto-danger: #9b625b;
  --goto-sans: Inter, "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif;
  position: fixed;
  z-index: var(--slidev-z-index-modal, 100);
  top: 1rem;
  right: 1.1rem;
  width: min(22rem, calc(100vw - 2.2rem));
  border: 1px solid var(--goto-line-strong);
  background: var(--goto-paper);
  color: var(--goto-ink);
  font-family: var(--goto-sans);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
  visibility: hidden;
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
}

.pane-goto.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
  visibility: visible;
  transition-delay: 0s;
}

:global(html.dark .pane-goto) {
  --goto-paper: #222a27;
  --goto-ink: #e8ece9;
  --goto-soft: #a7b0ab;
  --goto-faint: #737d77;
  --goto-line: rgba(232, 236, 233, 0.1);
  --goto-line-strong: rgba(232, 236, 233, 0.19);
  --goto-sage: #92aba2;
  --goto-sage-soft: rgba(146, 171, 162, 0.1);
  --goto-danger: #c38c82;
}

.pane-goto__field {
  padding: 0.9rem 1rem 0.8rem;
}

.pane-goto__field label {
  display: block;
  margin: 0 0 0.6rem;
  color: var(--goto-soft);
  font-size: 0.58rem;
  font-weight: 650;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
}

.pane-goto__input-line {
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--goto-line-strong);
  transition: border-color 140ms ease;
}

.pane-goto__input-line:focus-within {
  border-color: var(--goto-sage);
}

.pane-goto__input-line.is-invalid {
  border-color: var(--goto-danger);
}

.pane-goto__input-line input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--goto-ink);
  font-family: var(--goto-sans);
  font-size: 1rem;
  font-weight: 450;
  letter-spacing: -0.01em;
}

.pane-goto__input-line input::placeholder {
  color: var(--goto-faint);
  opacity: 1;
}

.pane-goto__results {
  overflow: auto;
  max-height: min(25rem, calc(100vh - 9.5rem));
  border-top: 1px solid var(--goto-line);
  scrollbar-color: var(--goto-line-strong) transparent;
  scrollbar-width: thin;
}

.pane-goto__results ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pane-goto__results li {
  position: relative;
}

.pane-goto__results li::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: transparent;
  content: "";
}

.pane-goto__results li.is-selected {
  background: var(--goto-sage-soft);
}

.pane-goto__results li.is-selected::before {
  background: var(--goto-sage);
}

.pane-goto__results button {
  display: grid;
  width: 100%;
  grid-template-columns: 2rem minmax(0, 1fr);
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.62rem 1rem;
  border: 0;
  background: transparent;
  color: var(--goto-ink);
  text-align: left;
}

.pane-goto__results button:focus-visible {
  outline: 1px solid var(--goto-sage);
  outline-offset: -2px;
}

.pane-goto__results button > span {
  color: var(--goto-faint);
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.pane-goto__results button :deep(*) {
  overflow: hidden;
  font-family: var(--goto-sans);
  font-size: 0.72rem;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-goto__empty {
  margin: 0;
  padding: 0.75rem 1rem 0.85rem;
  border-top: 1px solid var(--goto-line);
  color: var(--goto-danger);
  font-size: 0.72rem;
}

@media (max-width: 640px) {
  .pane-goto {
    top: 0.75rem;
    right: 0.75rem;
    width: calc(100vw - 1.5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pane-goto,
  .pane-goto__input-line {
    transition-duration: 0.01ms;
  }
}
</style>
