<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDrawings } from '@slidev/client/composables/useDrawings.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { configs } from '@slidev/client/env.ts'
import { isColorSchemaConfigured, isDark, toggleDark } from '@slidev/client/logic/dark.ts'
import { activeElement, fullscreen, hasViewerCssFilter, showEditor, showInfoDialog, toggleOverview } from '@slidev/client/state/index.ts'
import { downloadPDF } from '@slidev/client/utils.ts'
import IconButton from '@slidev/client/internals/IconButton.vue'
import MenuButton from '@slidev/client/internals/MenuButton.vue'
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
  <div
    class="pane-nav-dock"
    :class="wrapperClass"
  >
    <nav
      ref="root"
      class="pane-nav"
      @mouseleave="onMouseLeave"
    >
      <IconButton
        :class="{ disabled: !hasPrev }"
        :disabled="!hasPrev"
        :aria-disabled="!hasPrev"
        title="Go to previous slide"
        @click="prevSidebar"
      >
        <div class="i-carbon:arrow-left" />
      </IconButton>
      <IconButton
        :class="{ disabled: !hasNext }"
        :disabled="!hasNext"
        :aria-disabled="!hasNext"
        title="Go to next slide"
        @click="nextSidebar"
      >
        <div class="i-carbon:arrow-right" />
      </IconButton>
      <template v-if="!isEmbedded">
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
          <div
            v-if="drawingEnabled"
            class="pane-nav__brush"
            :style="{ background: brush.color }"
          />
        </IconButton>
        <MenuButton>
          <template #button>
            <IconButton title="More Options">
              <div class="i-carbon:settings-adjust" />
              <div v-if="hasViewerCssFilter" w-2 h-2 bg-primary rounded-full absolute top-0.5 right-0.5 />
            </IconButton>
          </template>
          <template #menu>
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
              <IconButton
                v-if="configs.info"
                title="Show info"
                @click="showInfoDialog = !showInfoDialog"
              >
                <div class="i-carbon:information" />
              </IconButton>
            </div>
            <Settings />
          </template>
        </MenuButton>
      </template>

      <div class="pane-nav__counter" :aria-label="`Slide ${currentSlideNo} of ${total}`">
        <strong>{{ formatSlideNo(currentSlideNo) }}</strong>
        <span>/ {{ formatSlideNo(total) }}</span>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.pane-nav-dock {
  position: relative;
  z-index: 12;
  flex: 0 0 auto;
  border-top: 1px solid rgba(32, 41, 37, 0.1);
}

.pane-nav {
  --pane-nav-border: rgba(32, 41, 37, 0.1);
  --pane-nav-border-strong: rgba(32, 41, 37, 0.19);
  --pane-nav-bg: #e9ece9;
  --pane-nav-hover: rgba(111, 137, 128, 0.1);
  --pane-nav-ink: #34403b;
  --pane-nav-soft: #7d8883;
  --pane-nav-sage: #6f8980;
  --pane-nav-sans: Inter, "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif;
  display: flex;
  width: 100%;
  min-height: 2.7rem;
  align-items: center;
  gap: 0.08rem;
  padding: 0 0.55rem;
  border: 0;
  background: var(--pane-nav-bg);
  color: var(--pane-nav-ink);
  font-family: var(--pane-nav-sans);
}

.pane-nav :deep(.slidev-icon-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  min-width: 1.8rem;
  height: 1.8rem;
  border-radius: 0;
  font-size: 0.8rem;
  color: inherit;
  opacity: 0.72;
  transition: background-color 180ms ease, opacity 180ms ease, color 180ms ease, transform 180ms ease;
}

.pane-nav :deep(.slidev-icon-btn:hover) {
  background: var(--pane-nav-hover);
  opacity: 1;
  transform: translateY(-1px);
}

.pane-nav :deep(.slidev-icon-btn:focus-visible) {
  outline: 1px solid var(--pane-nav-sage);
  outline-offset: -1px;
}

.pane-nav :deep(.slidev-icon-btn.disabled) {
  opacity: 0.32;
}

.pane-nav__menu-icons {
  display: grid;
  grid-template-columns: repeat(5, 1.9rem);
  gap: 0.15rem;
  padding: 0.4rem;
  border-bottom: 1px solid var(--pane-nav-border);
}

.pane-nav :deep(.flex.relative > .bg-main.text-main) {
  border-color: var(--pane-nav-border-strong) !important;
  border-radius: 0 !important;
  background: var(--pane-nav-bg) !important;
  box-shadow: none !important;
}

.pane-nav__menu-icons :deep(.slidev-icon-btn) {
  position: relative;
  display: inline-flex;
  width: 1.9rem;
  min-width: 1.9rem;
  height: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  color: inherit;
  font-size: 0.86rem;
}

.pane-nav__menu-icons :deep(.slidev-icon-btn:hover) {
  background: var(--pane-nav-hover);
}

.pane-nav__brush {
  position: absolute;
  right: 0.35rem;
  bottom: 0.25rem;
  left: 0.35rem;
  height: 1px;
}

.pane-nav__counter {
  display: flex;
  margin-left: auto;
  align-items: center;
  gap: 0.3rem;
  height: 1.8rem;
  padding-left: 0.45rem;
  color: var(--pane-nav-soft);
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.pane-nav__counter strong {
  color: var(--pane-nav-ink);
  font-size: 0.68rem;
  font-weight: 600;
}

:global(html.dark .pane-nav) {
  --pane-nav-border: rgba(232, 236, 233, 0.1);
  --pane-nav-border-strong: rgba(232, 236, 233, 0.19);
  --pane-nav-bg: #171e1c;
  --pane-nav-hover: rgba(146, 171, 162, 0.1);
  --pane-nav-ink: #e3e8e5;
  --pane-nav-soft: #9ca7a1;
  --pane-nav-sage: #92aba2;
}

:global(html.dark .pane-nav-dock) {
  border-top-color: rgba(232, 236, 233, 0.1);
}

:global(html.dark .pane-nav__menu-icons) {
  border-bottom-color: rgba(232, 236, 233, 0.1);
}

@media (max-width: 640px) {
  .pane-nav {
    min-height: 2.4rem;
    padding: 0 0.4rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pane-nav-dock,
  .pane-nav :deep(.slidev-icon-btn) {
    transition-duration: 0.01ms;
  }
}
</style>
