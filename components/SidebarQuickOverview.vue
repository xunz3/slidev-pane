<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, ref, watchEffect } from 'vue'
import { currentOverviewPage, overviewRowCount } from '@slidev/client/logic/overview.ts'
import { breakpoints, showOverview, windowSize } from '@slidev/client/state/index.ts'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import DrawingPreview from '@slidev/client/internals/DrawingPreview.vue'
import IconButton from '@slidev/client/internals/IconButton.vue'
import SlideContainer from '@slidev/client/internals/SlideContainer.vue'
import SlideWrapper from '@slidev/client/internals/SlideWrapper.vue'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'

const nav = useNav()
const { currentSlideNo, slides } = nav
const { goSidebar } = useSidebarPresenterNav()

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

const xs = breakpoints.smaller('xs')
const sm = breakpoints.smaller('sm')

const padding = 3 * 16 * 2
const gap = 2.5 * 16
const cardWidth = computed(() => {
  if (xs.value)
    return windowSize.width.value - padding
  else if (sm.value)
    return (windowSize.width.value - padding - gap) / 2
  return 300
})

const rowCount = computed(() => {
  return Math.max(1, Math.floor((windowSize.width.value - padding) / (cardWidth.value + gap)))
})

const keyboardBuffer = ref('')

function formatSlideNo(no: number) {
  return String(no).padStart(2, '0')
}

function getSlideTitle(route: (typeof slides.value)[number]) {
  return route.meta?.slide?.title?.trim() || `Slide ${route.no}`
}

useEventListener('keypress', (e) => {
  if (!showOverview.value) {
    keyboardBuffer.value = ''
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (keyboardBuffer.value) {
      go(+keyboardBuffer.value)
      keyboardBuffer.value = ''
    }
    else {
      go(currentOverviewPage.value)
    }
    return
  }
  const num = Number.parseInt(e.key.replace(/\D/g, ''))
  if (Number.isNaN(num)) {
    keyboardBuffer.value = ''
    return
  }
  if (!keyboardBuffer.value && num === 0)
    return

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
})

watchEffect(() => {
  currentOverviewPage.value = currentSlideNo.value
  overviewRowCount.value = rowCount.value
})
</script>

<template>
  <Transition name="pane-overview">
    <div
      v-if="showOverview"
      class="pane-overview"
      @click="close"
    >
      <header class="pane-overview__head" @click.stop>
        <div class="pane-overview__heading">
          <h2>Overview</h2>
          <p>{{ formatSlideNo(slides.length) }} slides</p>
        </div>

        <nav class="pane-overview__tools" aria-label="Overview tools">
          <IconButton title="Close overview" @click="close">
            <div class="i-carbon:close" />
          </IconButton>
        </nav>
      </header>

      <div
        class="pane-overview__grid"
        :style="`grid-template-columns: repeat(auto-fit,minmax(${cardWidth}px,1fr))`"
        @click.stop
      >
        <button
          v-for="(route, idx) of slides"
          :key="route.no"
          type="button"
          class="pane-overview__item"
          :class="{ 'is-active': focus(idx + 1), 'is-match': keyboardBuffer && String(route.no).startsWith(keyboardBuffer) }"
          :aria-current="route.no === currentSlideNo ? 'page' : undefined"
          @click="go(route.no)"
        >
          <span class="pane-overview__meta">
            <span class="pane-overview__number">
              <template v-if="keyboardBuffer && String(route.no).startsWith(keyboardBuffer)">
                <strong>{{ keyboardBuffer }}</strong>{{ String(route.no).slice(keyboardBuffer.length) }}
              </template>
              <template v-else>
                {{ formatSlideNo(route.no) }}
              </template>
            </span>
            <span class="pane-overview__title">{{ getSlideTitle(route) }}</span>
          </span>
          <div class="pane-overview__frame" :style="{ width: `${cardWidth + 2}px` }">
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

    </div>
  </Transition>
</template>

<style scoped>
.pane-overview {
  --overview-paper: #f1f3f0;
  --overview-sheet: #fdfdfa;
  --overview-ink: #202925;
  --overview-soft: #68736e;
  --overview-faint: #919a95;
  --overview-line: rgba(32, 41, 37, 0.1);
  --overview-line-strong: rgba(32, 41, 37, 0.19);
  --overview-sage: #6f8980;
  --overview-sage-soft: rgba(111, 137, 128, 0.1);
  --overview-sans: Inter, "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif;
  position: fixed;
  z-index: var(--slidev-z-index-modal, 100);
  inset: 0;
  height: calc(var(--vh, 1vh) * 100);
  overflow-y: auto;
  padding: 0 2rem 2rem;
  background: var(--overview-paper);
  color: var(--overview-ink);
  font-family: var(--overview-sans);
  user-select: none;
}

:global(html.dark .pane-overview) {
  --overview-paper: #1b2220;
  --overview-sheet: #28312e;
  --overview-ink: #e8ece9;
  --overview-soft: #a7b0ab;
  --overview-faint: #737d77;
  --overview-line: rgba(232, 236, 233, 0.1);
  --overview-line-strong: rgba(232, 236, 233, 0.19);
  --overview-sage: #92aba2;
  --overview-sage-soft: rgba(146, 171, 162, 0.1);
}

.pane-overview__head {
  position: sticky;
  z-index: 3;
  top: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 58px;
  align-items: center;
  gap: 2rem;
  border-bottom: 1px solid var(--overview-line);
  background: var(--overview-paper);
}

.pane-overview__heading {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
}

.pane-overview__heading h2,
.pane-overview__heading p {
  margin: 0;
}

.pane-overview__heading h2 {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.11em;
  line-height: 1;
  text-transform: uppercase;
}

.pane-overview__heading p {
  color: var(--overview-faint);
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.pane-overview__tools {
  display: flex;
  align-items: center;
}

.pane-overview__tools :deep(.slidev-icon-btn) {
  display: inline-flex;
  width: 1.85rem;
  min-width: 1.85rem;
  height: 1.85rem;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--overview-soft);
  font-size: 0.78rem;
  transition: color 180ms ease, background-color 180ms ease, transform 180ms ease;
}

.pane-overview__tools :deep(.slidev-icon-btn:hover) {
  background: var(--overview-sage-soft);
  color: var(--overview-ink);
  transform: translateY(-1px);
}

.pane-overview__grid {
  display: grid;
  width: 100%;
  gap: 2.1rem 1.45rem;
  padding: 1.75rem 0 2.5rem;
}

.pane-overview__item {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0 0 0 0.7rem;
  border: 0;
  background: transparent;
  color: var(--overview-soft);
  text-align: left;
}

.pane-overview__item::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: var(--overview-sage);
  content: "";
  opacity: 0;
  transform: scaleY(0.55);
  transition: opacity 180ms ease, transform 180ms ease;
}

.pane-overview__item.is-active::before {
  opacity: 1;
  transform: scaleY(1);
}

.pane-overview__item:focus-visible {
  outline: 1px solid var(--overview-sage);
  outline-offset: 0.55rem;
}

.pane-overview__meta {
  display: grid;
  width: min(100%, 300px);
  grid-template-columns: 2rem minmax(0, 1fr);
  align-items: baseline;
}

.pane-overview__number {
  color: var(--overview-faint);
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.pane-overview__number strong {
  color: var(--overview-sage);
  font-weight: 700;
}

.pane-overview__title {
  overflow: hidden;
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-overview__frame {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--overview-line);
  background: var(--overview-sheet);
  transition: border-color 180ms ease;
}

.pane-overview__item:hover .pane-overview__frame {
  border-color: var(--overview-line-strong);
}

.pane-overview__item.is-match:not(.is-active) .pane-overview__meta {
  text-decoration-color: var(--overview-sage);
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.25rem;
}

.pane-overview-enter-active,
.pane-overview-leave-active {
  transition: opacity 170ms ease;
}

.pane-overview-enter-from,
.pane-overview-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .pane-overview {
    padding: 0 1rem 1.25rem;
  }

  .pane-overview__head {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 54px;
    gap: 1rem;
  }

  .pane-overview__grid {
    gap: 1.7rem 1rem;
    padding-top: 1.35rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pane-overview-enter-active,
  .pane-overview-leave-active,
  .pane-overview__tools :deep(.slidev-icon-btn),
  .pane-overview__frame {
    transition-duration: 0.01ms;
  }
}
</style>
