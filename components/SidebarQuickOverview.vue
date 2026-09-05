<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { currentOverviewPage, overviewRowCount } from '@slidev/client/logic/overview.ts'
import { showOverview, windowSize } from '@slidev/client/state/index.ts'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import DrawingPreview from '@slidev/client/internals/DrawingPreview.vue'
import IconButton from '@slidev/client/internals/IconButton.vue'
import SlideContainer from '@slidev/client/internals/SlideContainer.vue'
import SlideWrapper from '@slidev/client/internals/SlideWrapper.vue'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'
import { usePaneDialog } from '../composables/usePaneDialog'

const nav = useNav()
const { currentSlideNo, slides } = nav
const { goSidebar } = useSidebarPresenterNav()
const container = ref<HTMLDivElement>()
usePaneDialog(showOverview, container)

function close() {
  showOverview.value = false
}

function go(page: number) {
  goSidebar(page)
  close()
}

function focus(page: number) {
  if (page === currentOverviewPage.value)
    return true
  return false
}

const gap = 20
const rowCount = computed(() => Math.max(1, Math.floor((windowSize.width.value - 64 + gap) / (240 + gap))))
const cardWidth = computed(() => {
  const outerPadding = windowSize.width.value <= 640 ? 32 : 64
  const available = windowSize.width.value - outerPadding - (rowCount.value - 1) * gap
  return Math.max(1, Math.min(360, Math.floor(available / rowCount.value) - 20))
})

const keyboardBuffer = ref('')

function formatSlideNo(no: number) {
  return String(no).padStart(2, '0')
}

function getSlideTitle(route: (typeof slides.value)[number]) {
  return route.meta?.slide?.title?.trim() || `Slide ${route.no}`
}

function handleKeydown(e: KeyboardEvent) {
  if (!showOverview.value || e.ctrlKey || e.metaKey || e.altKey)
    return

  const movement: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -rowCount.value,
    ArrowDown: rowCount.value,
  }
  if (e.key in movement) {
    e.preventDefault()
    e.stopPropagation()
    keyboardBuffer.value = ''
    currentOverviewPage.value = Math.min(slides.value.length, Math.max(1, currentOverviewPage.value + movement[e.key]))
    container.value?.focus({ preventScroll: true })
    return
  }
  if (e.key === 'Enter') {
    // Let the close button retain its native keyboard activation.
    if ((e.target as HTMLElement)?.closest('.pane-overview__tools'))
      return
    e.preventDefault()
    e.stopPropagation()
    if (keyboardBuffer.value) {
      go(+keyboardBuffer.value)
      keyboardBuffer.value = ''
    }
    else {
      go(currentOverviewPage.value)
    }
    return
  }
  if (!/^\d$/.test(e.key)) {
    keyboardBuffer.value = ''
    return
  }
  const num = Number(e.key)
  if (!keyboardBuffer.value && num === 0)
    return

  e.preventDefault()
  e.stopPropagation()
  keyboardBuffer.value += String(num)

  if (+keyboardBuffer.value > slides.value.length) {
    keyboardBuffer.value = ''
    return
  }

  const exactMatch = slides.value.findIndex(i => String(i.no) === keyboardBuffer.value)
  if (exactMatch !== -1)
    currentOverviewPage.value = exactMatch + 1

  if (+keyboardBuffer.value * 10 > slides.value.length) {
    go(+keyboardBuffer.value)
    keyboardBuffer.value = ''
  }
}

watchEffect(() => {
  currentOverviewPage.value = currentSlideNo.value
  overviewRowCount.value = rowCount.value
})

watch([currentOverviewPage, showOverview], async () => {
  if (!showOverview.value) {
    keyboardBuffer.value = ''
    return
  }
  await nextTick()
  container.value?.querySelector('.pane-overview__item.is-active')?.scrollIntoView({ block: 'nearest' })
})
</script>




<template>
  <Transition name="pane-overview">
    <div
      v-if="showOverview"
      ref="container"
      class="pane-overview pane-ui"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pane-overview-title"
      tabindex="-1"
      @click.self="close"
      @keydown="handleKeydown"
    >
      <header class="pane-overview__head" @click.stop>
        <div class="pane-overview__heading">
          <div>
            <h2 id="pane-overview-title">Slide overview</h2>
            <p>{{ slides.length }} slides</p>
          </div>
        </div>

        <nav class="pane-overview__tools" aria-label="Overview tools">
          <IconButton title="Close overview" @click="close">
            <div class="i-carbon:close" />
          </IconButton>
        </nav>
      </header>

      <div
        class="pane-overview__grid"
        :style="{ gridTemplateColumns: `repeat(${rowCount}, minmax(0, 1fr))` }"
        @click.stop
      >
        <button
          v-for="(route, idx) of slides"
          :key="route.no"
          type="button"
          class="pane-overview__item"
          :class="{
            'is-active': focus(idx + 1),
            'is-match': keyboardBuffer && String(route.no).startsWith(keyboardBuffer),
          }"
          :aria-current="route.no === currentSlideNo ? 'page' : undefined"
          :aria-label="`Slide ${route.no}: ${getSlideTitle(route)}`"
          @focus="currentOverviewPage = idx + 1"
          @click="go(route.no)"
        >
          <span class="pane-overview__meta">
            <span class="pane-overview__number">
              <template v-if="keyboardBuffer && String(route.no).startsWith(keyboardBuffer)">
                <strong>{{ keyboardBuffer }}</strong>
                {{ String(route.no).slice(keyboardBuffer.length) }}
              </template>
              <template v-else>
                {{ formatSlideNo(route.no) }}
              </template>
            </span>
            <span class="pane-overview__title">{{ getSlideTitle(route) }}</span>
          </span>
          <div class="pane-overview__frame" :style="{ width: `${cardWidth + 2}px` }" inert aria-hidden="true">
            <SlideContainer
              :key="route.no"
              :no="route.no"
              :use-snapshot="true"
              :width="cardWidth"
              class="pointer-events-none"
            >
              <SlideWrapper
                :clicks-context="createFixedClicks(route, CLICKS_MAX)"
                :route="route"
                render-context="overview"
              />
              <DrawingPreview :page="route.no" />
            </SlideContainer>
          </div>
        </button>
      </div>
      <footer class="pane-overview__footer">
        <span>
          <kbd class="pane-key">←</kbd>
          <kbd class="pane-key">→</kbd>
          to navigate
        </span>
        <span>
          <kbd class="pane-key">↵</kbd>
          to open
        </span>
        <span>
          Or type a slide number
          <span v-if="keyboardBuffer" class="pane-overview__buffer">{{ keyboardBuffer }}</span>
        </span>
      </footer>
    </div>
  </Transition>
</template>

<style scoped>
.pane-overview {
  position: fixed;
  z-index: var(--slidev-z-index-modal, 100);
  inset: 0;
  display: flex;
  height: 100vh;
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--pane-bg);
  color: var(--pane-ink);
  outline: 0;
  user-select: none;
}
.pane-overview__head {
  z-index: 3;
  display: flex;
  min-height: 76px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 36px;
  border-bottom: 1px solid var(--pane-line);
  background: var(--pane-surface);
}
.pane-overview__heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pane-overview__heading h2 {
  margin: 0 0 5px;
  font: 500 18px var(--pane-display);
  letter-spacing: -0.5px;
}
.pane-overview__heading p {
  margin: 0;
  color: var(--pane-muted);
  font-size: 11px;
}
.pane-overview__tools {
  display: flex;
  align-items: center;
  gap: 20px;
}
.pane-overview__tools :deep(.slidev-icon-btn) {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: var(--pane-muted);
  font-size: 18px;
  opacity: 1;
}
.pane-overview__tools :deep(.slidev-icon-btn:hover) {
  background: var(--pane-hover);
  color: var(--pane-ink);
}
.pane-overview__tools :deep(.slidev-icon-btn:focus-visible),
.pane-overview__item:focus-visible {
  outline: 2px solid var(--pane-accent);
  outline-offset: 3px;
}
.pane-overview__grid {
  display: grid;
  min-height: 0;
  flex: 1;
  align-content: start;
  gap: 20px;
  overflow: auto;
  padding: 28px 32px 36px;
  scrollbar-color: var(--pane-line-strong) transparent;
  scrollbar-width: thin;
}
.pane-overview__item {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--pane-muted);
  text-align: left;
  cursor: pointer;
  transition:
    background 160ms,
    border-color 160ms,
    box-shadow 160ms;
}
.pane-overview__item:hover {
  background: var(--pane-hover);
}
.pane-overview__item.is-active {
  background: var(--pane-accent-soft);
  color: var(--pane-accent);
}
.pane-overview__item.is-active .pane-overview__frame {
  border-color: var(--pane-accent);
}
.pane-overview__meta {
  display: flex;
  width: 100%;
  order: 2;
  align-items: center;
  gap: 8px;
}
.pane-overview__number {
  min-width: 27px;
  border-radius: 4px;
  color: var(--pane-faint);
  font: 10px/22px var(--pane-mono);
  text-align: center;
}
.pane-overview__item.is-active .pane-overview__number {
  color: var(--pane-accent);
  font-weight: 600;
}
.pane-overview__number strong {
  font-weight: 700;
}
.pane-overview__title {
  overflow: hidden;
  font: 500 12px var(--pane-font);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pane-overview__frame {
  max-width: 100%;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--pane-line);
  border-radius: 5px;
  background: var(--pane-raised);
}
.pane-overview__item[aria-current='page'] .pane-overview__meta::after {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  margin-left: auto;
  margin-right: 5px;
  border-radius: 50%;
  background: var(--pane-accent);
  content: '';
}
.pane-overview__item.is-match:not(.is-active) {
  border-color: var(--pane-accent-line);
}
.pane-overview__footer {
  display: flex;
  min-height: 52px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 10px 16px;
  border-top: 1px solid var(--pane-line);
  background: var(--pane-surface);
  color: var(--pane-muted);
  font-size: 10px;
}
.pane-overview__footer > span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pane-overview__buffer {
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--pane-accent-soft);
  color: var(--pane-accent);
  font-family: var(--pane-mono);
}
.pane-overview-enter-active,
.pane-overview-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.pane-overview-enter-from,
.pane-overview-leave-to {
  opacity: 0;
  transform: scale(0.99);
}
@media (max-width: 640px) {
  .pane-overview__head {
    min-height: 80px;
    padding: 0 20px;
  }
  .pane-overview__heading h2 {
    font-size: 18px;
  }
  .pane-overview__grid {
    padding: 20px 16px;
  }
  .pane-overview__footer {
    gap: 14px;
    font-size: 9px;
  }
  .pane-overview__footer > span:last-child {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pane-overview-enter-active,
  .pane-overview-leave-active,
  .pane-overview__item {
    transition: none;
  }
}
</style>
