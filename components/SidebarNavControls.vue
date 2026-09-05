<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useDrawings } from '@slidev/client/composables/useDrawings.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { configs } from '@slidev/client/env.ts'
import { isColorSchemaConfigured, isDark, toggleDark } from '@slidev/client/logic/dark.ts'
import { activeElement, fullscreen, hasViewerCssFilter, showEditor, showGotoDialog, showInfoDialog, toggleOverview } from '@slidev/client/state/index.ts'
import { downloadPDF } from '@slidev/client/utils.ts'
import IconButton from '@slidev/client/internals/IconButton.vue'
import Settings from '@slidev/client/internals/Settings.vue'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'

const {
  currentSlideNo,
  hasNext,
  hasPrev,
  isEmbedded,
  total,
} = useNav()
const {
  enterClassicPresenter,
  exitSidebarPresenter,
  nextSidebar,
  prevSidebar,
} = useSidebarPresenterNav()
const {
  brush,
  drawingEnabled,
  isDrawing,
} = useDrawings()

const { isFullscreen, toggle: toggleFullscreen } = fullscreen
const root = ref<HTMLDivElement>()
const menu = ref<HTMLDivElement>()
const menuOpen = ref(false)
onClickOutside(menu, () => menuOpen.value = false)

function onMouseLeave() {
  if (root.value && activeElement.value && root.value.contains(activeElement.value))
    activeElement.value.blur()
}

const wrapperClass = computed(() => isDrawing.value ? 'pointer-events-none' : '')

function formatSlideNo(no: number) {
  return String(no).padStart(2, '0')
}
</script>




<template>
  <div class="pane-nav-dock" :class="wrapperClass">
    <nav ref="root" class="pane-nav" aria-label="Presentation controls" @mouseleave="onMouseLeave">
      <div class="pane-nav__leading"><slot name="leading" /></div>
      <div class="pane-nav__pagination">
        <IconButton
          :class="{ disabled: !hasPrev }"
          :disabled="!hasPrev"
          :aria-disabled="!hasPrev"
          title="Go to previous slide"
          @click="prevSidebar"
        >
          <div class="i-carbon:arrow-left" />
        </IconButton>
        <button
          type="button"
          class="pane-nav__counter"
          :aria-label="`Slide ${currentSlideNo} of ${total}. Find a slide`"
          title="Find a slide (G)"
          @click="showGotoDialog = true"
        >
          <strong>{{ formatSlideNo(currentSlideNo) }}</strong>
          <span>/</span>
          <span>{{ formatSlideNo(total) }}</span>
        </button>
        <IconButton
          :class="{ disabled: !hasNext }"
          :disabled="!hasNext"
          :aria-disabled="!hasNext"
          title="Go to next slide"
          @click="nextSidebar"
        >
          <div class="i-carbon:arrow-right" />
        </IconButton>
      </div>
      <div v-if="!isEmbedded" class="pane-nav__tools">
        <IconButton
          :title="isFullscreen ? 'Exit full screen' : 'Enter full screen'"
          :aria-pressed="isFullscreen"
          @click="toggleFullscreen"
        >
          <div v-if="isFullscreen" class="i-carbon:minimize" />
          <div v-else class="i-carbon:maximize" />
        </IconButton>
        <IconButton
          v-if="__SLIDEV_FEATURE_DRAWINGS__"
          class="relative"
          :title="drawingEnabled ? 'Hide drawing toolbar' : 'Show drawing toolbar'"
          :aria-pressed="drawingEnabled"
          @click="drawingEnabled = !drawingEnabled"
        >
          <div class="i-carbon:pen" />
          <div v-if="drawingEnabled" class="pane-nav__brush" :style="{ background: brush.color }" />
        </IconButton>
        <div ref="menu" class="pane-nav__menu" @keydown.esc.stop="menuOpen = false">
          <IconButton
            title="More options"
            :aria-expanded="menuOpen"
            aria-controls="pane-options"
            @click="menuOpen = !menuOpen"
          >
            <div class="i-carbon:settings-adjust" />
            <div v-if="hasViewerCssFilter" w-2 h-2 bg-primary rounded-full absolute top-0.5 right-0.5 />
          </IconButton>
          <div v-if="menuOpen" id="pane-options" class="pane-nav__popover">
            <p class="pane-nav__menu-label">Presentation tools</p>
            <div class="pane-nav__menu-icons" aria-label="Presenter tools">
              <IconButton title="Show slide overview" @click="toggleOverview()">
                <div class="i-carbon:apps" />
              </IconButton>
              <IconButton
                v-if="!isColorSchemaConfigured"
                :title="isDark ? 'Switch to light mode theme' : 'Switch to dark mode theme'"
                @click="toggleDark()"
              >
                <carbon-moon v-if="isDark" />
                <carbon-sun v-else />
              </IconButton>
              <IconButton title="Classic presenter" @click="enterClassicPresenter">
                <div class="i-carbon:user-speaker" />
              </IconButton>
              <IconButton title="Play mode" @click="exitSidebarPresenter">
                <div class="i-carbon:presentation-file" />
              </IconButton>
              <IconButton
                v-if="__DEV__ && __SLIDEV_FEATURE_EDITOR__"
                :title="showEditor ? 'Hide editor' : 'Show editor'"
                @click="showEditor = !showEditor"
              >
                <div class="i-carbon:text-annotation-toggle" />
              </IconButton>
              <IconButton v-if="!__DEV__ && configs.download" title="Download as PDF" @click="downloadPDF">
                <div class="i-carbon:download" />
              </IconButton>
              <IconButton v-if="__SLIDEV_FEATURE_BROWSER_EXPORTER__" title="Browser exporter" to="/export">
                <div class="i-carbon:document-pdf" />
              </IconButton>
              <IconButton v-if="configs.info" title="Show info" @click="showInfoDialog = !showInfoDialog">
                <div class="i-carbon:information" />
              </IconButton>
            </div>
            <Settings />
          </div>
        </div>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.pane-nav-dock {
  position: relative;
  z-index: 12;
  border-top: 1px solid var(--pane-line);
  background: var(--pane-surface);
}
.pane-nav {
  display: grid;
  min-height: 48px;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  color: var(--pane-muted);
  font-family: var(--pane-font);
}
.pane-nav__leading {
  display: flex;
  align-items: center;
}
.pane-nav__pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pane-nav__tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
}
.pane-nav :deep(.slidev-icon-btn) {
  position: relative;
  display: inline-flex;
  width: 30px;
  min-width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 16px;
  opacity: 1;
  transition:
    background 160ms,
    color 160ms;
}
.pane-nav :deep(.slidev-icon-btn:hover) {
  background: var(--pane-hover);
  color: var(--pane-ink);
}
.pane-nav :deep(.slidev-icon-btn:focus-visible),
.pane-nav__counter:focus-visible {
  outline: 2px solid var(--pane-accent);
  outline-offset: 2px;
}
.pane-nav :deep(.slidev-icon-btn.disabled) {
  opacity: 0.3;
  pointer-events: none;
}
.pane-nav :deep(.slidev-icon-btn[aria-pressed='true']),
.pane-nav :deep(.slidev-icon-btn[aria-expanded='true']) {
  background: var(--pane-accent-soft);
  color: var(--pane-accent);
}
.pane-nav__pagination :deep(.slidev-icon-btn) {
  font-size: 14px;
}
.pane-nav__counter {
  display: flex;
  height: 30px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pane-faint);
  font: 11px var(--pane-mono);
  cursor: pointer;
}
.pane-nav__counter:hover {
  background: var(--pane-hover);
}
.pane-nav__counter strong {
  color: var(--pane-ink);
  font-weight: 600;
}
.pane-nav__menu {
  position: relative;
}
.pane-nav__popover {
  position: absolute;
  right: 0;
  bottom: 42px;
  width: min(300px, calc(100vw - 28px));
  max-height: calc(100dvh - 90px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--pane-line-strong) transparent;
  scrollbar-width: thin;
  padding: 8px;
  border: 1px solid var(--pane-line);
  border-radius: 12px;
  background: var(--pane-raised);
  color: var(--pane-ink);
  box-shadow: var(--pane-popup-shadow);
}
.pane-nav__menu-label {
  margin: 5px 8px 8px;
  color: var(--pane-muted);
  font-size: 11px;
  font-weight: 600;
}
.pane-nav__menu-icons {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 4px 4px 12px;
  border-bottom: 1px solid var(--pane-line);
}
.pane-nav__menu-icons :deep(.slidev-icon-btn) {
  width: 36px;
  height: 34px;
}
.pane-nav__popover :deep(input),
.pane-nav__popover :deep(select) {
  border-color: var(--pane-line-strong);
  accent-color: var(--pane-accent);
}
.pane-nav__popover :deep(.text-primary) {
  color: var(--pane-accent);
}
.pane-nav__brush {
  position: absolute;
  right: 9px;
  bottom: 4px;
  left: 9px;
  height: 2px;
  border-radius: 2px;
}
@media (max-width: 640px) {
  .pane-nav {
    min-height: 44px;
    grid-template-columns: 1fr auto 1fr;
    gap: 8px;
    padding: 0 10px;
  }
  .pane-nav :deep(.slidev-icon-btn) {
    width: 24px;
    min-width: 24px;
    height: 28px;
  }
  .pane-nav__tools {
    gap: 3px;
  }
  .pane-nav__pagination {
    gap: 2px;
  }
  .pane-nav__counter {
    gap: 4px;
    padding: 0 4px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pane-nav :deep(.slidev-icon-btn) {
    transition: none;
  }
}
</style>
