<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useHead } from '@unhead/vue'
import { useWakeLock } from '@slidev/client/composables/useWakeLock.ts'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import { useSwipeControls } from '@slidev/client/composables/useSwipeControls.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { slidesTitle } from '@slidev/client/env.ts'
import ClicksSlider from '@slidev/client/internals/ClicksSlider.vue'
import ContextMenu from '@slidev/client/internals/ContextMenu.vue'
import DrawingControls from '@slidev/client/internals/DrawingControls.vue'
import DrawingPreview from '@slidev/client/internals/DrawingPreview.vue'
import NoteEditable from '@slidev/client/internals/NoteEditable.vue'
import NoteStatic from '@slidev/client/internals/NoteStatic.vue'
import SlideContainer from '@slidev/client/internals/SlideContainer.vue'
import SlidesShow from '@slidev/client/internals/SlidesShow.vue'
import SlideWrapper from '@slidev/client/internals/SlideWrapper.vue'
import { onContextMenu } from '@slidev/client/logic/contextMenu.ts'
import { isDark } from '@slidev/client/logic/dark.ts'
import { registerShortcuts } from '@slidev/client/logic/shortcuts.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SidebarGoto from '../components/SidebarGoto.vue'
import SidebarNavControls from '../components/SidebarNavControls.vue'
import SidebarQuickOverview from '../components/SidebarQuickOverview.vue'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'
import {
  SIDEBAR_PRESENTER_DEFAULT_ZOOM,
  SIDEBAR_PRESENTER_ZOOM_STEP,
  useSidebarPresenterZoom,
} from '../composables/useSidebarPresenterZoom'

registerShortcuts()

if (__SLIDEV_FEATURE_WAKE_LOCK__)
  useWakeLock()

const main = ref<HTMLDivElement>()
const canvasSurface = ref<HTMLDivElement>()
const canvasViewport = ref<HTMLDivElement>()
const thumbViewport = ref<HTMLElement>()
const { width: canvasSurfaceWidth, height: canvasSurfaceHeight } = useElementSize(canvasSurface)

useSwipeControls(main)

const {
  clicksContext,
  currentSlideNo,
  currentSlideRoute,
  getPrimaryClicks,
  slides,
  total,
} = useNav()
const {
  enterClassicPresenter,
  exitSidebarPresenter,
  goSidebar,
} = useSidebarPresenterNav()
const {
  canZoomIn,
  canZoomOut,
  getWheelZoomTarget,
  setSlideZoom,
  slideZoom,
  zoomPercentage,
} = useSidebarPresenterZoom()

useHead({ title: `Pane Presenter - ${slidesTitle}` })

const thumbWidth = 208
const thumbRowHeight = 180
const thumbOverscan = 4
const thumbScrollTop = ref(0)
const thumbViewportHeight = ref(0)
const isCompactLayout = ref(false)
const notesEditing = ref(false)
const thumbnailClicks = new WeakMap<object, ReturnType<typeof createFixedClicks>>()
let thumbViewportObserver: ResizeObserver | undefined
let compactLayoutMedia: MediaQueryList | undefined

function getThumbnailClicks(route: (typeof slides.value)[number]) {
  if (!thumbnailClicks.has(route))
    thumbnailClicks.set(route, createFixedClicks(route, CLICKS_MAX))

  const ctx = thumbnailClicks.get(route)!
  ctx.current = route.no === currentSlideNo.value ? clicksContext.value.current : CLICKS_MAX
  return ctx
}

const currentTitle = computed(() => currentSlideRoute.value?.meta?.slide?.title || `Slide ${currentSlideNo.value}`)

const progressWidth = computed(() => {
  if (total.value <= 1)
    return '100%'
  return `${((currentSlideNo.value - 1) / (total.value - 1)) * 100 + 1}%`
})

const virtualRange = computed(() => {
  if (isCompactLayout.value) {
    return {
      start: 0,
      end: slides.value.length,
    }
  }

  const visibleCount = Math.max(1, Math.ceil(thumbViewportHeight.value / thumbRowHeight))
  const start = Math.max(0, Math.floor(thumbScrollTop.value / thumbRowHeight) - thumbOverscan)
  const end = Math.min(slides.value.length, start + visibleCount + thumbOverscan * 2)

  return { start, end }
})

const visibleSlides = computed(() => {
  const { start, end } = virtualRange.value

  return slides.value.slice(start, end).map((route, index) => ({
    route,
    top: (start + index) * thumbRowHeight,
  }))
})

const totalThumbsHeight = computed(() => `${slides.value.length * thumbRowHeight}px`)
const canvasFrameStyle = computed(() => {
  if (!canvasSurfaceWidth.value || !canvasSurfaceHeight.value)
    return {}

  return {
    width: `${Math.max(canvasSurfaceWidth.value, canvasSurfaceWidth.value * slideZoom.value)}px`,
    height: `${Math.max(canvasSurfaceHeight.value, canvasSurfaceHeight.value * slideZoom.value)}px`,
  }
})
const canvasStyle = computed(() => {
  if (!canvasSurfaceWidth.value || !canvasSurfaceHeight.value)
    return {}

  return {
    width: `${canvasSurfaceWidth.value * slideZoom.value}px`,
    height: `${canvasSurfaceHeight.value * slideZoom.value}px`,
    flex: '0 0 auto',
  }
})

function clampBetween(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getCanvasMetrics(zoom = slideZoom.value) {
  const viewport = canvasViewport.value
  const baseWidth = canvasSurfaceWidth.value || viewport?.clientWidth || 0
  const baseHeight = canvasSurfaceHeight.value || viewport?.clientHeight || 0
  const visibleWidth = viewport?.clientWidth || baseWidth
  const visibleHeight = viewport?.clientHeight || baseHeight
  const slideWidth = baseWidth * zoom
  const slideHeight = baseHeight * zoom
  const stageWidth = Math.max(visibleWidth, slideWidth)
  const stageHeight = Math.max(visibleHeight, slideHeight)

  return {
    baseHeight,
    baseWidth,
    slideHeight,
    slideLeft: Math.max(0, (stageWidth - slideWidth) / 2),
    slideTop: Math.max(0, (stageHeight - slideHeight) / 2),
    slideWidth,
    stageHeight,
    stageWidth,
    visibleHeight,
    visibleWidth,
    viewport,
  }
}

function focusCanvasZoom(nextZoom: number, offsetX?: number, offsetY?: number) {
  const previousZoom = slideZoom.value
  if (nextZoom === previousZoom)
    return

  const previous = getCanvasMetrics(previousZoom)
  const viewport = previous.viewport

  if (!viewport || !previous.baseWidth || !previous.baseHeight || !previous.visibleWidth || !previous.visibleHeight) {
    setSlideZoom(nextZoom)
    return
  }

  const anchorX = offsetX ?? previous.visibleWidth / 2
  const anchorY = offsetY ?? previous.visibleHeight / 2
  const slideX = clampBetween(
    (viewport.scrollLeft + anchorX - previous.slideLeft) / previousZoom,
    0,
    previous.baseWidth,
  )
  const slideY = clampBetween(
    (viewport.scrollTop + anchorY - previous.slideTop) / previousZoom,
    0,
    previous.baseHeight,
  )

  setSlideZoom(nextZoom)

  nextTick(() => {
    const next = getCanvasMetrics(slideZoom.value)
    const maxScrollLeft = Math.max(0, next.stageWidth - next.visibleWidth)
    const maxScrollTop = Math.max(0, next.stageHeight - next.visibleHeight)

    viewport.scrollLeft = clampBetween(
      slideX * slideZoom.value + next.slideLeft - anchorX,
      0,
      maxScrollLeft,
    )
    viewport.scrollTop = clampBetween(
      slideY * slideZoom.value + next.slideTop - anchorY,
      0,
      maxScrollTop,
    )
  })
}

function zoomCanvasIn() {
  focusCanvasZoom(slideZoom.value + SIDEBAR_PRESENTER_ZOOM_STEP)
}

function zoomCanvasOut() {
  focusCanvasZoom(slideZoom.value - SIDEBAR_PRESENTER_ZOOM_STEP)
}

function resetCanvasZoom() {
  focusCanvasZoom(SIDEBAR_PRESENTER_DEFAULT_ZOOM)
}

function handleCanvasWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey)
    return

  event.preventDefault()

  const viewport = canvasViewport.value
  if (!viewport)
    return

  const bounds = viewport.getBoundingClientRect()
  focusCanvasZoom(
    getWheelZoomTarget(event.deltaY),
    event.clientX - bounds.left,
    event.clientY - bounds.top,
  )
}

function restoreCursor() {
  document.body.style.cursor = ''
}

function updateCompactLayout() {
  if (typeof window === 'undefined')
    return

  isCompactLayout.value = window.innerWidth <= 960
}

function measureThumbViewport() {
  thumbViewportHeight.value = thumbViewport.value?.clientHeight || 0
}

function handleThumbScroll() {
  thumbScrollTop.value = thumbViewport.value?.scrollTop || 0
}

function ensureCurrentThumbVisible(no: number) {
  const viewport = thumbViewport.value

  if (!viewport || isCompactLayout.value)
    return

  const currentTop = (no - 1) * thumbRowHeight
  const currentBottom = currentTop + thumbRowHeight
  const viewportTop = viewport.scrollTop
  const viewportBottom = viewportTop + viewport.clientHeight

  if (currentTop < viewportTop) {
    viewport.scrollTo({ top: currentTop })
    thumbScrollTop.value = currentTop
  }
  else if (currentBottom > viewportBottom) {
    const nextTop = currentBottom - viewport.clientHeight
    viewport.scrollTo({ top: nextTop })
    thumbScrollTop.value = nextTop
  }
}

watch(
  currentSlideNo,
  async (no) => {
    await nextTick()
    ensureCurrentThumbVisible(no)
  },
  { immediate: true },
)

onMounted(() => {
  restoreCursor()
  updateCompactLayout()
  measureThumbViewport()
  handleThumbScroll()

  if (typeof window === 'undefined')
    return

  document.body.addEventListener('pointermove', restoreCursor, { passive: true })
  document.body.addEventListener('pointerdown', restoreCursor, { passive: true })
  compactLayoutMedia = window.matchMedia('(max-width: 960px)')
  compactLayoutMedia.addEventListener('change', updateCompactLayout)

  if (typeof ResizeObserver !== 'undefined' && thumbViewport.value) {
    thumbViewportObserver = new ResizeObserver(() => measureThumbViewport())
    thumbViewportObserver.observe(thumbViewport.value)
  }
})

onBeforeUnmount(() => {
  document.body.removeEventListener('pointermove', restoreCursor)
  document.body.removeEventListener('pointerdown', restoreCursor)
  restoreCursor()
  compactLayoutMedia?.removeEventListener('change', updateCompactLayout)
  thumbViewportObserver?.disconnect()
})
</script>

<template>
  <div class="sidebar-presenter" :class="{ 'is-dark': isDark }">
    <aside class="sidebar-presenter__rail">
      <div class="sidebar-presenter__rail-head">
        <div>
          <p class="sidebar-presenter__eyebrow">
            Pane Presenter
          </p>
          <h1 class="sidebar-presenter__heading">
            {{ slidesTitle }}
          </h1>
        </div>
        <button
          type="button"
          class="sidebar-presenter__toggle"
          @click="exitSidebarPresenter"
        >
          Exit
        </button>
      </div>

      <div
        ref="thumbViewport"
        class="sidebar-presenter__thumbs"
        @scroll.passive="handleThumbScroll"
      >
        <template v-if="isCompactLayout">
          <button
            v-for="route in slides"
            :key="route.no"
            type="button"
            class="sidebar-presenter__thumb"
            :class="{ 'is-active': route.no === currentSlideNo }"
            @click="goSidebar(route.no)"
          >
            <div class="sidebar-presenter__thumb-meta">
              <span>{{ route.no }}</span>
              <span class="sidebar-presenter__thumb-title">
                {{ route.meta?.slide?.title || `Slide ${route.no}` }}
              </span>
            </div>
            <div class="sidebar-presenter__thumb-frame">
              <SlideContainer
                :key="route.no"
                :width="thumbWidth"
                class="pointer-events-none important:[&_*]:select-none"
              >
                <SlideWrapper
                  :clicks-context="getThumbnailClicks(route)"
                  :route="route"
                  render-context="overview"
                />
                <DrawingPreview :page="route.no" />
              </SlideContainer>
            </div>
          </button>
        </template>

        <div
          v-else
          class="sidebar-presenter__thumbs-spacer"
          :style="{ height: totalThumbsHeight }"
        >
          <div
            v-for="{ route, top } in visibleSlides"
            :key="route.no"
            class="sidebar-presenter__thumb-row"
            :style="{ top: `${top}px` }"
          >
            <button
              type="button"
              class="sidebar-presenter__thumb"
              :class="{ 'is-active': route.no === currentSlideNo }"
              @click="goSidebar(route.no)"
            >
              <div class="sidebar-presenter__thumb-meta">
                <span>{{ route.no }}</span>
                <span class="sidebar-presenter__thumb-title">
                  {{ route.meta?.slide?.title || `Slide ${route.no}` }}
                </span>
              </div>
              <div class="sidebar-presenter__thumb-frame">
                <SlideContainer
                  :key="route.no"
                  :width="thumbWidth"
                  class="pointer-events-none important:[&_*]:select-none"
                >
                  <SlideWrapper
                    :clicks-context="getThumbnailClicks(route)"
                    :route="route"
                    render-context="overview"
                  />
                  <DrawingPreview :page="route.no" />
                </SlideContainer>
              </div>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <main ref="main" class="sidebar-presenter__main">
      <header class="sidebar-presenter__main-head">
        <div class="sidebar-presenter__main-copy">
          <p class="sidebar-presenter__eyebrow">
            Current Slide
          </p>
          <div class="sidebar-presenter__title-row">
            <h2 class="sidebar-presenter__title">
              {{ currentTitle }}
            </h2>
            <span class="sidebar-presenter__count">
              {{ currentSlideNo }} / {{ total }}
            </span>
          </div>
        </div>

        <div class="sidebar-presenter__main-actions">
          <div
            class="sidebar-presenter__zoom"
            title="Ctrl/⌘ + wheel on the slide to zoom"
          >
            <button
              type="button"
              class="sidebar-presenter__zoom-button"
              title="Zoom out"
              :disabled="!canZoomOut"
              @click="zoomCanvasOut"
            >
              -
            </button>
            <button
              type="button"
              class="sidebar-presenter__zoom-button sidebar-presenter__zoom-button--readout"
              title="Reset zoom"
              @click="resetCanvasZoom"
            >
              {{ zoomPercentage }}
            </button>
            <button
              type="button"
              class="sidebar-presenter__zoom-button"
              title="Zoom in"
              :disabled="!canZoomIn"
              @click="zoomCanvasIn"
            >
              +
            </button>
          </div>

          <button
            type="button"
            class="sidebar-presenter__toggle sidebar-presenter__toggle--soft sidebar-presenter__toggle--compact"
            @click="enterClassicPresenter"
          >
            Classic Presenter
          </button>
        </div>
      </header>

      <section class="sidebar-presenter__canvas-wrap">
        <div
          ref="canvasSurface"
          class="sidebar-presenter__canvas-surface"
        >
          <div
            ref="canvasViewport"
            class="sidebar-presenter__canvas-viewport"
            @wheel="handleCanvasWheel"
          >
            <div
              class="sidebar-presenter__canvas-stage"
              :style="canvasFrameStyle"
            >
              <SlideContainer
                class="sidebar-presenter__canvas"
                :style="canvasStyle"
                is-main
                @contextmenu="onContextMenu"
              >
                <SlidesShow render-context="presenter" />
              </SlideContainer>
            </div>
          </div>
        </div>

        <ClicksSlider
          :key="currentSlideRoute?.no"
          :clicks-context="getPrimaryClicks(currentSlideRoute)"
          class="sidebar-presenter__clicks"
        />
      </section>

      <section class="sidebar-presenter__notes">
        <div class="sidebar-presenter__notes-head">
          <p class="sidebar-presenter__eyebrow">
            Notes
          </p>
          <div class="sidebar-presenter__notes-actions">
            <button
              v-if="__DEV__"
              type="button"
              class="sidebar-presenter__toggle sidebar-presenter__toggle--soft sidebar-presenter__toggle--compact"
              :aria-pressed="notesEditing"
              @click="notesEditing = !notesEditing"
            >
              {{ notesEditing ? 'Done' : 'Edit Notes' }}
            </button>
          </div>
        </div>
        <div class="sidebar-presenter__notes-body">
          <NoteEditable
            v-if="__DEV__"
            :key="`edit-${currentSlideNo}`"
            v-model:editing="notesEditing"
            :no="currentSlideNo"
            class="sidebar-presenter__notes-display"
            :clicks-context="clicksContext"
          />
          <NoteStatic
            v-else
            :key="`static-${currentSlideNo}`"
            :no="currentSlideNo"
            class="sidebar-presenter__notes-display"
            :clicks-context="clicksContext"
          />
        </div>
      </section>

      <div class="sidebar-presenter__progress">
        <div class="sidebar-presenter__progress-bar" :style="{ width: progressWidth }"></div>
      </div>
    </main>
  </div>

  <SidebarNavControls />
  <SidebarGoto />
  <SidebarQuickOverview />
  <ContextMenu />
  <DrawingControls v-if="__SLIDEV_FEATURE_DRAWINGS__" />
</template>

<style scoped>
.sidebar-presenter {
  --sidebar-surface: rgba(250, 248, 243, 0.92);
  --sidebar-surface-strong: rgba(255, 255, 255, 0.96);
  --sidebar-border: rgba(27, 31, 35, 0.08);
  --sidebar-border-strong: rgba(27, 31, 35, 0.18);
  --sidebar-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
  --sidebar-ink: #18212a;
  --sidebar-ink-soft: rgba(24, 33, 42, 0.66);
  --sidebar-accent: #23525a;
  --sidebar-rail-bg: rgba(246, 242, 235, 0.9);
  --sidebar-soft-button-bg: rgba(255, 255, 255, 0.72);
  --sidebar-thumb-hover: rgba(255, 255, 255, 0.5);
  --sidebar-thumb-frame-bg: #fff;
  --sidebar-notes-bg: rgba(255, 255, 255, 0.66);
  --sidebar-notes-display-bg: rgba(255, 255, 255, 0.56);
  --sidebar-progress-track: rgba(24, 33, 42, 0.08);
  --sidebar-progress-fill: linear-gradient(90deg, #23525a, #4b7a83);
  --sidebar-scrollbar-track: rgba(24, 33, 42, 0.06);
  --sidebar-scrollbar-thumb: rgba(35, 82, 90, 0.28);
  --sidebar-scrollbar-thumb-hover: rgba(35, 82, 90, 0.42);
  --sidebar-thumb-row-height: 180px;
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(35, 82, 90, 0.08), transparent 24%),
    linear-gradient(180deg, #f4f1eb 0%, #ece7de 100%);
  color: var(--sidebar-ink);
}

.sidebar-presenter.is-dark {
  --sidebar-surface: rgba(19, 25, 31, 0.9);
  --sidebar-surface-strong: rgba(28, 36, 44, 0.96);
  --sidebar-border: rgba(233, 239, 244, 0.08);
  --sidebar-border-strong: rgba(233, 239, 244, 0.18);
  --sidebar-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  --sidebar-ink: #eef3f7;
  --sidebar-ink-soft: rgba(238, 243, 247, 0.66);
  --sidebar-accent: #4f8e98;
  --sidebar-rail-bg: rgba(16, 22, 28, 0.88);
  --sidebar-soft-button-bg: rgba(31, 39, 47, 0.78);
  --sidebar-thumb-hover: rgba(255, 255, 255, 0.06);
  --sidebar-thumb-frame-bg: rgba(10, 14, 18, 0.9);
  --sidebar-notes-bg: rgba(22, 29, 36, 0.82);
  --sidebar-notes-display-bg: rgba(14, 19, 24, 0.72);
  --sidebar-progress-track: rgba(238, 243, 247, 0.12);
  --sidebar-progress-fill: linear-gradient(90deg, #4f8e98, #7db5bf);
  --sidebar-scrollbar-track: rgba(238, 243, 247, 0.05);
  --sidebar-scrollbar-thumb: rgba(125, 181, 191, 0.28);
  --sidebar-scrollbar-thumb-hover: rgba(125, 181, 191, 0.46);
  background:
    radial-gradient(circle at top left, rgba(79, 142, 152, 0.18), transparent 26%),
    linear-gradient(180deg, #0f1419 0%, #141b22 100%);
}

.sidebar-presenter__rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--sidebar-border);
  background: var(--sidebar-rail-bg);
  backdrop-filter: blur(18px);
}

.sidebar-presenter__rail-head,
.sidebar-presenter__main-head,
.sidebar-presenter__notes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.sidebar-presenter__rail-head {
  padding: 1.2rem 1rem 1rem;
  border-bottom: 1px solid var(--sidebar-border);
}

.sidebar-presenter__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--sidebar-ink-soft);
}

.sidebar-presenter__heading,
.sidebar-presenter__title {
  margin: 0.3rem 0 0;
  line-height: 1;
  letter-spacing: -0.03em;
}

.sidebar-presenter__heading {
  font-size: 1.15rem;
  font-weight: 600;
}

.sidebar-presenter__toggle {
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  background: var(--sidebar-accent);
  color: #f8f5ef;
  padding: 0.55rem 0.95rem;
  font-size: 0.85rem;
  transition:
    transform 150ms ease,
    background-color 150ms ease,
    border-color 150ms ease;
}

.sidebar-presenter__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  transform: none;
}

.sidebar-presenter__toggle:hover {
  transform: translateY(-1px);
}

.sidebar-presenter__toggle--soft {
  background: var(--sidebar-soft-button-bg);
  color: var(--sidebar-ink);
}

.sidebar-presenter__toggle--compact {
  padding: 0.42rem 0.78rem;
  font-size: 0.77rem;
}

.sidebar-presenter__thumbs {
  flex: 1;
  overflow-y: auto;
  padding: 0.9rem 0.75rem 1rem;
  scrollbar-width: thin;
  scrollbar-color: var(--sidebar-scrollbar-thumb) var(--sidebar-scrollbar-track);
}

.sidebar-presenter__thumbs-spacer {
  position: relative;
}

.sidebar-presenter__thumb-row {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--sidebar-thumb-row-height);
}

.sidebar-presenter__thumb {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.6rem;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  height: calc(var(--sidebar-thumb-row-height) - 12px);
  margin-bottom: 0.75rem;
  padding: 0.55rem;
  text-align: left;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    transform 150ms ease;
}

.sidebar-presenter__thumb:hover {
  transform: translateY(-1px);
  background: var(--sidebar-thumb-hover);
}

.sidebar-presenter__thumb.is-active {
  border-color: var(--sidebar-border-strong);
  background: var(--sidebar-surface-strong);
  box-shadow: var(--sidebar-shadow);
}

.sidebar-presenter__thumb-meta {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  font-size: 0.74rem;
  color: var(--sidebar-ink-soft);
}

.sidebar-presenter__thumb-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-presenter__thumb-frame {
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--sidebar-border);
  background: var(--sidebar-thumb-frame-bg);
}

.sidebar-presenter__main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  min-width: 0;
  padding: 1.2rem 1.35rem 0;
  gap: 1rem;
}

.sidebar-presenter__main-head {
  border: 1px solid var(--sidebar-border);
  border-radius: 22px;
  background: var(--sidebar-surface);
  box-shadow: var(--sidebar-shadow);
  padding: 0.82rem 0.95rem;
  backdrop-filter: blur(18px);
}

.sidebar-presenter__main-copy {
  min-width: 0;
}

.sidebar-presenter__title-row {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-top: 0.08rem;
}

.sidebar-presenter__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.22rem;
  font-weight: 600;
}

.sidebar-presenter__count {
  font-size: 0.78rem;
  color: var(--sidebar-ink-soft);
}

.sidebar-presenter__main-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.sidebar-presenter__zoom {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.24rem;
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  background: var(--sidebar-soft-button-bg);
}

.sidebar-presenter__zoom-button {
  min-width: 2rem;
  height: 2rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--sidebar-ink);
  font-size: 0.82rem;
  font-weight: 600;
  transition:
    transform 150ms ease,
    background-color 150ms ease,
    border-color 150ms ease,
    opacity 150ms ease;
}

.sidebar-presenter__zoom-button:hover {
  transform: translateY(-1px);
  background: var(--sidebar-thumb-hover);
}

.sidebar-presenter__zoom-button:disabled {
  opacity: 0.38;
  transform: none;
}

.sidebar-presenter__zoom-button--readout {
  min-width: 4.4rem;
  padding: 0 0.7rem;
  border-color: var(--sidebar-border);
  font-variant-numeric: tabular-nums;
}

.sidebar-presenter__canvas-wrap {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  border: 1px solid var(--sidebar-border);
  border-radius: 28px;
  background: var(--sidebar-surface);
  box-shadow: var(--sidebar-shadow);
  overflow: hidden;
}

.sidebar-presenter__canvas-surface {
  min-height: 0;
  overflow: hidden;
  padding: 1rem 1rem 0.4rem;
}

.sidebar-presenter__canvas-viewport {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--sidebar-scrollbar-thumb) var(--sidebar-scrollbar-track);
}

.sidebar-presenter__canvas-stage {
  display: flex;
  min-width: 100%;
  min-height: 100%;
  align-items: center;
  justify-content: center;
}

.sidebar-presenter__canvas {
  cursor: auto;
}

.sidebar-presenter__clicks {
  padding: 0 1.1rem 1rem;
}

.sidebar-presenter__notes {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  max-height: clamp(9rem, 22vh, 15rem);
  border: 1px solid var(--sidebar-border);
  border-radius: 22px;
  background: var(--sidebar-notes-bg);
  padding: 0.78rem 0.9rem 0.9rem;
}

.sidebar-presenter__notes-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.sidebar-presenter__notes-body {
  min-height: 0;
  overflow: hidden;
  margin-top: 0.55rem;
}

.sidebar-presenter__notes-display {
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: auto;
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  background: var(--sidebar-notes-display-bg);
  color: var(--sidebar-ink-soft);
  line-height: 1.7;
  scrollbar-width: thin;
  scrollbar-color: var(--sidebar-scrollbar-thumb) var(--sidebar-scrollbar-track);
}

.sidebar-presenter__thumbs::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.sidebar-presenter__canvas-viewport::-webkit-scrollbar,
.sidebar-presenter__notes-display::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.sidebar-presenter__thumbs::-webkit-scrollbar-track,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar-track,
.sidebar-presenter__notes-display::-webkit-scrollbar-track {
  background: var(--sidebar-scrollbar-track);
  border-radius: 999px;
}

.sidebar-presenter__thumbs::-webkit-scrollbar-thumb,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar-thumb,
.sidebar-presenter__notes-display::-webkit-scrollbar-thumb {
  border: 1.5px solid transparent;
  border-radius: 999px;
  background: var(--sidebar-scrollbar-thumb);
  background-clip: padding-box;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.sidebar-presenter__thumbs::-webkit-scrollbar-thumb:hover,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar-thumb:hover,
.sidebar-presenter__notes-display::-webkit-scrollbar-thumb:hover {
  background: var(--sidebar-scrollbar-thumb-hover);
  background-clip: padding-box;
}

.sidebar-presenter__progress {
  height: 4px;
  margin-bottom: 0.75rem;
  border-radius: 999px;
  background: var(--sidebar-progress-track);
  overflow: hidden;
}

.sidebar-presenter__progress-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--sidebar-progress-fill);
  transition: width 160ms ease;
}

@media (max-width: 960px) {
  .sidebar-presenter {
    grid-template-columns: 1fr;
    grid-template-rows: 190px minmax(0, 1fr);
  }

  .sidebar-presenter__thumbs-spacer,
  .sidebar-presenter__thumb-row {
    position: static;
    height: auto;
  }

  .sidebar-presenter__rail {
    border-right: none;
    border-bottom: 1px solid var(--sidebar-border);
  }

  .sidebar-presenter__thumbs {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding-top: 0.75rem;
  }

  .sidebar-presenter__thumb {
    height: auto;
    width: 220px;
    min-width: 220px;
    margin-bottom: 0;
  }

  .sidebar-presenter__main {
    padding: 1rem;
  }

  .sidebar-presenter__main-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .sidebar-presenter__main-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .sidebar-presenter__zoom {
    width: 100%;
    justify-content: center;
  }
}
</style>
