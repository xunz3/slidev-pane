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
import VerticalDivider from '@slidev/client/internals/VerticalDivider.vue'
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
</script>

<template>
  <div
    class="fixed left-0 bottom-0 z-[45] p-3 transition duration-300 opacity-0 hover:opacity-100 focus-within:opacity-100 focus-visible:opacity-100"
    :class="wrapperClass"
  >
    <nav
      ref="root"
      class="pane-nav"
      @mouseleave="onMouseLeave"
    >
      <IconButton v-if="!isEmbedded" :title="isFullscreen ? 'Close fullscreen' : 'Enter fullscreen'" @click="toggleFullscreen">
        <div v-if="isFullscreen" class="i-carbon:minimize" />
        <div v-else class="i-carbon:maximize" />
      </IconButton>
      <IconButton :class="{ disabled: !hasPrev }" title="Go to previous slide" @click="prevSidebar">
        <div class="i-carbon:arrow-left" />
      </IconButton>
      <IconButton :class="{ disabled: !hasNext }" title="Go to next slide" @click="nextSidebar">
        <div class="i-carbon:arrow-right" />
      </IconButton>
      <IconButton v-if="!isEmbedded" title="Show slide overview" @click="toggleOverview()">
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

      <VerticalDivider />

      <template v-if="__SLIDEV_FEATURE_DRAWINGS__ && !isEmbedded">
        <IconButton class="relative" :title="drawingEnabled ? 'Hide drawing toolbar' : 'Show drawing toolbar'" @click="drawingEnabled = !drawingEnabled">
          <div class="i-carbon:pen" />
          <div
            v-if="drawingEnabled"
            class="absolute left-1 right-1 bottom-0 h-0.7 rounded-full"
            :style="{ background: brush.color }"
          />
        </IconButton>
        <VerticalDivider />
      </template>

      <template v-if="!isEmbedded">
        <IconButton title="Classic Presenter" @click="enterClassicPresenter">
          <div class="i-carbon:user-speaker" />
        </IconButton>
        <IconButton title="Play Mode" @click="exitSidebarPresenter">
          <div class="i-carbon:presentation-file" />
        </IconButton>

        <IconButton
          v-if="__DEV__ && __SLIDEV_FEATURE_EDITOR__"
          :title="showEditor ? 'Hide editor' : 'Show editor'"
          class="lt-md:hidden"
          @click="showEditor = !showEditor"
        >
          <div class="i-carbon:text-annotation-toggle" />
        </IconButton>
      </template>

      <template v-if="!__DEV__">
        <IconButton v-if="configs.download" title="Download as PDF" @click="downloadPDF">
          <div class="i-carbon:download" />
        </IconButton>
      </template>

      <template v-if="__SLIDEV_FEATURE_BROWSER_EXPORTER__ && !isEmbedded">
        <IconButton title="Browser Exporter" to="/export">
          <div class="i-carbon:document-pdf" />
        </IconButton>
      </template>

      <IconButton
        v-if="configs.info && !isEmbedded"
        title="Show info"
        @click="showInfoDialog = !showInfoDialog"
      >
        <div class="i-carbon:information" />
      </IconButton>

      <template v-if="!isEmbedded">
        <VerticalDivider />

        <MenuButton>
          <template #button>
            <IconButton title="More Options">
              <div class="i-carbon:settings-adjust" />
              <div v-if="hasViewerCssFilter" w-2 h-2 bg-primary rounded-full absolute top-0.5 right-0.5 />
            </IconButton>
          </template>
          <template #menu>
            <Settings />
          </template>
        </MenuButton>
      </template>

      <VerticalDivider v-if="!isEmbedded" />

      <div class="pane-nav__counter">
        <div>
          {{ currentSlideNo }}
          <span class="opacity-50">/ {{ total }}</span>
        </div>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.pane-nav {
  --pane-nav-border: rgba(15, 23, 42, 0.08);
  --pane-nav-bg: rgba(250, 250, 250, 0.76);
  --pane-nav-hover: rgba(15, 23, 42, 0.06);
  --pane-nav-ink: rgba(15, 23, 42, 0.78);
  --pane-nav-counter: rgba(15, 23, 42, 0.68);
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  gap: 0.15rem;
  padding: 0.32rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--pane-nav-border);
  background: var(--pane-nav-bg);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(18px);
  color: var(--pane-nav-ink);
}

.pane-nav :deep(.slidev-icon-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.95rem;
  min-width: 1.95rem;
  height: 1.95rem;
  border-radius: 999px;
  font-size: 0.95rem;
  color: inherit;
  opacity: 0.9;
  transition:
    background-color 150ms ease,
    transform 150ms ease,
    opacity 150ms ease,
    color 150ms ease;
}

.pane-nav :deep(.slidev-icon-btn:hover) {
  transform: translateY(-1px);
  background: var(--pane-nav-hover);
  opacity: 1;
}

.pane-nav :deep(.slidev-icon-btn.disabled) {
  opacity: 0.32;
}

.pane-nav :deep(.w-1px) {
  height: 1rem;
  margin: 0 0.2rem;
  opacity: 0.12;
}

.pane-nav__counter {
  display: flex;
  align-items: center;
  height: 1.95rem;
  padding: 0 0.45rem 0 0.25rem;
  font-size: 0.76rem;
  line-height: 1;
  letter-spacing: 0.01em;
  color: var(--pane-nav-counter);
}

:global(html.dark) .pane-nav {
  --pane-nav-border: rgba(226, 232, 240, 0.08);
  --pane-nav-bg: rgba(17, 24, 31, 0.76);
  --pane-nav-hover: rgba(255, 255, 255, 0.08);
  --pane-nav-ink: rgba(226, 232, 240, 0.86);
  --pane-nav-counter: rgba(226, 232, 240, 0.72);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.26);
}
</style>
