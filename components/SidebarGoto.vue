<script setup lang="ts">
import TitleRenderer from '#slidev/title-renderer'
import Fuse from 'fuse.js'
import { computed, nextTick, ref, watch } from 'vue'
import { showGotoDialog, showOverview } from '@slidev/client/state/index.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'
import { usePaneDialog } from '../composables/usePaneDialog'

const container = ref<HTMLDivElement>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLDivElement>()
const items = ref<HTMLLIElement[]>()
const text = ref('')
const selectedIndex = ref(0)

const { currentSlideNo, slides } = useNav()
const { goSidebar } = useSidebarPresenterNav()
usePaneDialog(showGotoDialog, container, input)

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
    return slides.value.map(route => route.meta?.slide).filter(notNull)
  return fuse.value.search(path.value).map(result => result.item)
})
const valid = computed(() => !!result.value.length)

function close() {
  text.value = ''
  showGotoDialog.value = false
}

function goTo() {
  const item = result.value[selectedIndex.value]
  if (!item)
    return
  goSidebar(item.no)
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
  item?.scrollIntoView({ block: 'nearest' })
}

function updateText(event: Event) {
  selectedIndex.value = 0
  text.value = (event.target as HTMLInputElement).value
  nextTick(() => list.value?.scrollTo({ top: 0 }))
}

function select(no: number) {
  goSidebar(no)
  close()
}

watch(showGotoDialog, async (show) => {
  if (show) {
    showOverview.value = false
    text.value = ''
    selectedIndex.value = 0
    await nextTick()
    list.value?.scrollTo({ top: 0 })
  }
})
</script>




<template>
  <div v-if="showGotoDialog" class="pane-goto-backdrop pane-ui" @click.self="close">
    <div
      id="slidev-goto-dialog"
      ref="container"
      class="pane-goto"
      role="dialog"
      aria-modal="true"
      aria-label="Find a slide"
      tabindex="-1"
    >
      <div class="pane-goto__field">
        <div class="pane-goto__heading">
          <label for="slidev-goto-input">Find a slide</label>
          <button type="button" title="Close search (Esc)" aria-label="Close search" @click="close">
            <span class="i-carbon:close" aria-hidden="true" />
          </button>
        </div>
        <div class="pane-goto__input-line">
          <span class="i-carbon:search" aria-hidden="true" />
          <input
            id="slidev-goto-input"
            ref="input"
            :value="text"
            type="text"
            :aria-invalid="Boolean(!valid && text)"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search by title or slide number…"
            role="combobox"
            aria-autocomplete="list"
            :aria-controls="result.length ? 'pane-search-results' : undefined"
            :aria-expanded="result.length > 0"
            :aria-activedescendant="result.length ? `pane-search-result-${selectedIndex}` : undefined"
            @keydown.enter.stop.prevent="goTo"
            @keydown.escape="close"
            @keydown.down="focusDown"
            @keydown.up="focusUp"
            @input="updateText"
          />
        </div>
      </div>
      <div class="pane-goto__result-label" aria-live="polite">
        {{ hasQuery ? `${result.length} matching slides` : 'All slides' }}
      </div>
      <div v-if="result.length > 0" ref="list" class="pane-goto__results">
        <ul id="pane-search-results" role="listbox" aria-label="Slides">
          <li
            v-for="(item, index) of result"
            ref="items"
            :key="item.id"
            role="presentation"
            :class="{ 'is-selected': selectedIndex === index }"
          >
            <button
              type="button"
              tabindex="-1"
              :id="`pane-search-result-${index}`"
              role="option"
              :aria-selected="selectedIndex === index"
              @focus="selectedIndex = index"
              @click.stop.prevent="select(item.no)"
            >
              <span>{{ String(item.no).padStart(2, '0') }}</span>
              <span class="pane-goto__result-title"><TitleRenderer :no="item.no" /></span>
              <span v-if="item.no === currentSlideNo" class="pane-goto__current">Current</span>
              <span v-else class="pane-goto__return i-carbon:arrow-right" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>
      <p v-else-if="text" class="pane-goto__empty">
        No slides found for “{{ text }}”.
        <br />
        <span>Try a slide number or a different title.</span>
      </p>
      <footer class="pane-goto__footer">
        <span>
          <kbd class="pane-key">↑</kbd>
          <kbd class="pane-key">↓</kbd>
          to navigate
        </span>
        <span>
          <kbd class="pane-key">↵</kbd>
          to open
        </span>
        <span>
          <kbd class="pane-key">esc</kbd>
          to close
        </span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.pane-goto-backdrop {
  position: fixed;
  z-index: var(--slidev-z-index-modal, 100);
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: min(16vh, 140px) 20px 20px;
  background: var(--pane-overlay);
  backdrop-filter: blur(7px);
}
.pane-goto {
  width: min(560px, 100%);
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--pane-line);
  border-radius: 16px;
  background: var(--pane-surface);
  color: var(--pane-ink);
  box-shadow: var(--pane-popup-shadow);
  animation: pane-search-in 180ms ease-out;
}
.pane-goto__field {
  padding: 18px 20px 16px;
}
.pane-goto__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.pane-goto__heading label {
  font: 600 15px var(--pane-display);
  letter-spacing: -0.2px;
}
.pane-goto__heading button {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pane-muted);
  cursor: pointer;
}
.pane-goto__heading button:hover {
  background: var(--pane-hover);
}
.pane-goto__input-line {
  display: flex;
  height: 44px;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--pane-line-strong);
  border-radius: 8px;
  background: var(--pane-bg);
  color: var(--pane-faint);
}
.pane-goto__input-line:focus-within {
  border-color: var(--pane-accent);
  box-shadow: 0 0 0 3px var(--pane-accent-soft);
}
.pane-goto__input-line > span {
  flex-shrink: 0;
  font-size: 18px;
}
.pane-goto__input-line input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--pane-ink);
  font: 13px var(--pane-font);
}
.pane-goto__input-line input::placeholder {
  color: var(--pane-faint);
  opacity: 1;
}
.pane-goto__result-label {
  padding: 0 22px 8px;
  color: var(--pane-faint);
  font-size: 10px;
}
.pane-goto__results {
  overflow: auto;
  max-height: min(350px, 42dvh);
  padding: 0 8px 8px;
  scrollbar-color: var(--pane-line-strong) transparent;
  scrollbar-width: thin;
}
.pane-goto__results ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.pane-goto__results li {
  position: relative;
  border-radius: 7px;
}
.pane-goto__results li.is-selected {
  background: var(--pane-accent-soft);
}
.pane-goto__results li:hover:not(.is-selected) {
  background: var(--pane-hover);
}
.pane-goto__results button {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  gap: 12px;
  padding: 8px 13px;
  border: 0;
  background: transparent;
  color: var(--pane-ink);
  text-align: left;
  cursor: pointer;
}
.pane-goto button:focus-visible {
  outline: 2px solid var(--pane-accent);
  outline-offset: -2px;
}
.pane-goto__results button > span:first-child {
  display: grid;
  width: 28px;
  height: 25px;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--pane-line);
  border-radius: 5px;
  background: var(--pane-surface);
  color: var(--pane-muted);
  font: 10px var(--pane-mono);
}
.pane-goto__results li.is-selected button > span:first-child {
  border-color: var(--pane-accent-line);
  color: var(--pane-accent);
}
.pane-goto__result-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pane-goto__result-title :deep(*) {
  margin: 0;
  font: inherit;
}
.pane-goto__current {
  color: var(--pane-faint);
  font-size: 10px;
}
.pane-goto__return {
  color: var(--pane-accent);
  opacity: 0;
}
.is-selected .pane-goto__return {
  opacity: 1;
}
.pane-goto__empty {
  margin: 0;
  padding: 30px 22px 40px;
  color: var(--pane-muted);
  font-size: 13px;
  line-height: 1.8;
  text-align: center;
  overflow-wrap: anywhere;
}
.pane-goto__empty > span {
  color: var(--pane-faint);
  font-size: 12px;
}
.pane-goto__footer {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 20px;
  border-top: 1px solid var(--pane-line);
  background: var(--pane-bg);
  color: var(--pane-muted);
  font-size: 10px;
}
.pane-goto__footer > span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pane-goto__footer > span:last-child {
  margin-left: auto;
}
@keyframes pane-search-in {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 640px) {
  .pane-goto-backdrop {
    padding: 60px 12px 12px;
  }
  .pane-goto__footer {
    gap: 10px;
    padding: 12px;
    font-size: 9px;
  }
}
@media (max-height: 550px) {
  .pane-goto-backdrop {
    padding-top: 16px;
  }
  .pane-goto__results {
    max-height: 35dvh;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pane-goto {
    animation: none;
  }
}
</style>
