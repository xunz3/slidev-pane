<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useHead } from '@unhead/vue'
import { useWakeLock } from '@slidev/client/composables/useWakeLock.ts'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import { useSwipeControls } from '@slidev/client/composables/useSwipeControls.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { slideAspect, slidesTitle } from '@slidev/client/env.ts'
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
import {
  getNotesHeightMax,
  getRailWidthMax,
  SIDEBAR_PRESENTER_MIN_NOTES_HEIGHT,
  SIDEBAR_PRESENTER_MIN_RAIL_WIDTH,
  useSidebarPresenterLayout,
} from '../composables/useSidebarPresenterLayout'
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
const canvasBounds = ref<HTMLDivElement>()
const canvasViewport = ref<HTMLDivElement>()
const thumbViewport = ref<HTMLElement>()
const { width: canvasBoundsWidth, height: canvasBoundsHeight } = useElementSize(canvasBounds)

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
  goSidebar,
} = useSidebarPresenterNav()
const {
  getWheelZoomTarget,
  setSlideZoom,
  slideZoom,
} = useSidebarPresenterZoom()
const {
  constrainPresenterLayout,
  notesHeight,
  persistPresenterLayout,
  railWidth,
  resetNotesHeight,
  resetRailWidth,
  setNotesHeight,
  setRailWidth,
} = useSidebarPresenterLayout()

useHead({ title: slidesTitle })

const presenterTitle = computed(() => slidesTitle.replace(/\s+-\s+Slidev$/, ''))
const defaultThumbWidth = 208
const thumbOverscan = 4
const sectionHeaderHeight = 44
const thumbViewportPaddingTop = 14
const thumbViewportPaddingBottom = 16
const thumbScrollTop = ref(0)
const thumbViewportHeight = ref(0)
const isCompactLayout = ref(false)
const notesEditing = ref(false)
const notesCollapsed = ref(false)
const collapsedSectionIds = ref<Set<string>>(new Set())
const thumbnailClicks = new WeakMap<object, ReturnType<typeof createFixedClicks>>()
type ResizeTarget = 'notes' | 'rail'
type ResizeSession = {
  pointerId: number
  startPosition: number
  startSize: number
  target: ResizeTarget
}
type SlideRoute = (typeof slides.value)[number]
type SlideSection = {
  id: string
  slides: SlideRoute[]
  title: string
}
type ThumbnailItem =
  | {
    height: number
    key: string
    kind: 'section'
    section: SlideSection
    top: number
  }
  | {
    height: number
    key: string
    kind: 'slide'
    route: SlideRoute
    sectionId: string
    top: number
  }

const resizeSession = ref<ResizeSession>()
let thumbViewportObserver: ResizeObserver | undefined
let compactLayoutMedia: MediaQueryList | undefined
let previousBodyCursor = ''
let previousBodyUserSelect = ''

function getThumbnailClicks(route: SlideRoute) {
  if (!thumbnailClicks.has(route))
    thumbnailClicks.set(route, createFixedClicks(route, CLICKS_MAX))

  const ctx = thumbnailClicks.get(route)!
  ctx.current = route.no === currentSlideNo.value ? clicksContext.value.current : CLICKS_MAX
  return ctx
}

const progressWidth = computed(() => {
  if (total.value <= 1)
    return '100%'
  return `${((currentSlideNo.value - 1) / (total.value - 1)) * 100 + 1}%`
})

const thumbWidth = computed(() => isCompactLayout.value
  ? defaultThumbWidth
  : Math.round(clampBetween(railWidth.value - 78, 176, 360)))
const thumbFrameHeight = computed(() => Math.ceil(thumbWidth.value / slideAspect.value))
const thumbRowHeight = computed(() => thumbFrameHeight.value + 64)
const presenterStyle = computed(() => ({
  '--sidebar-notes-height': `${notesHeight.value}px`,
  '--sidebar-rail-width': `${railWidth.value}px`,
  '--sidebar-thumb-row-height': `${thumbRowHeight.value}px`,
}))

function getSlideTitle(route: SlideRoute) {
  return route.meta?.slide?.title?.trim() || `Slide ${route.no}`
}

function getSlideFrontmatter(route: SlideRoute) {
  return route.meta?.slide?.frontmatter as Record<string, unknown> | undefined
}

function getExplicitSectionTitle(route: SlideRoute) {
  const section = getSlideFrontmatter(route)?.section

  if (typeof section === 'string' && section.trim())
    return section.trim()

  if (section && typeof section === 'object') {
    const title = (section as Record<string, unknown>).title
    if (typeof title === 'string' && title.trim())
      return title.trim()
  }
}

function startsSection(route: SlideRoute, index: number) {
  if (index === 0)
    return true

  const frontmatter = getSlideFrontmatter(route)
  return frontmatter?.layout === 'section' || Boolean(frontmatter?.section)
}

const slideSections = computed<SlideSection[]>(() => {
  const sections: SlideSection[] = []
  let currentSection: SlideSection | undefined

  slides.value.forEach((route, index) => {
    if (!currentSection || startsSection(route, index)) {
      currentSection = {
        id: `section-${route.no}`,
        slides: [],
        title: getExplicitSectionTitle(route) || getSlideTitle(route),
      }
      sections.push(currentSection)
    }

    currentSection.slides.push(route)
  })

  return sections
})

const currentSectionId = computed(() =>
  slideSections.value.find(section =>
    section.slides.some(route => route.no === currentSlideNo.value),
  )?.id,
)

function isSectionCollapsed(sectionId: string) {
  return collapsedSectionIds.value.has(sectionId)
}

function toggleSection(sectionId: string) {
  const next = new Set(collapsedSectionIds.value)

  if (next.has(sectionId))
    next.delete(sectionId)
  else
    next.add(sectionId)

  collapsedSectionIds.value = next
}

const thumbnailLayout = computed(() => {
  const items: ThumbnailItem[] = []
  let top = thumbViewportPaddingTop

  for (const section of slideSections.value) {
    items.push({
      height: sectionHeaderHeight,
      key: section.id,
      kind: 'section',
      section,
      top,
    })
    top += sectionHeaderHeight

    if (isSectionCollapsed(section.id))
      continue

    for (const route of section.slides) {
      items.push({
        height: thumbRowHeight.value,
        key: `slide-${route.no}`,
        kind: 'slide',
        route,
        sectionId: section.id,
        top,
      })
      top += thumbRowHeight.value
    }
  }

  return {
    items,
    totalHeight: top + thumbViewportPaddingBottom,
  }
})

const visibleThumbnailItems = computed(() => {
  if (isCompactLayout.value)
    return thumbnailLayout.value.items

  const overscan = thumbOverscan * thumbRowHeight.value
  const viewportStart = Math.max(0, thumbScrollTop.value - overscan)
  const viewportEnd = thumbScrollTop.value + thumbViewportHeight.value + overscan

  return thumbnailLayout.value.items.filter(item =>
    item.top + item.height >= viewportStart && item.top <= viewportEnd,
  )
})

const thumbnailListStyle = computed(() => isCompactLayout.value
  ? undefined
  : { height: `${thumbnailLayout.value.totalHeight}px` })
const thumbFrameStyle = computed(() => ({
  width: `${thumbWidth.value + 2}px`,
  height: `${thumbFrameHeight.value + 2}px`,
  maxWidth: '100%',
}))
const canvasFrameStyle = computed(() => {
  if (!canvasBoundsWidth.value || !canvasBoundsHeight.value)
    return {}

  return {
    width: `${Math.max(canvasBoundsWidth.value, canvasBoundsWidth.value * slideZoom.value)}px`,
    height: `${Math.max(canvasBoundsHeight.value, canvasBoundsHeight.value * slideZoom.value)}px`,
  }
})
const canvasStyle = computed(() => {
  if (!canvasBoundsWidth.value || !canvasBoundsHeight.value)
    return {}

  return {
    width: `${canvasBoundsWidth.value * slideZoom.value}px`,
    height: `${canvasBoundsHeight.value * slideZoom.value}px`,
    flex: '0 0 auto',
  }
})

function clampBetween(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getThumbnailItemStyle(item: ThumbnailItem) {
  if (isCompactLayout.value)
    return undefined

  return {
    height: `${item.height}px`,
    top: `${item.top}px`,
  }
}

function beginResize(target: ResizeTarget, event: PointerEvent) {
  if (event.button !== 0 || isCompactLayout.value)
    return

  event.preventDefault()
  previousBodyCursor = document.body.style.cursor
  previousBodyUserSelect = document.body.style.userSelect
  document.body.style.cursor = target === 'rail' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'

  resizeSession.value = {
    pointerId: event.pointerId,
    startPosition: target === 'rail' ? event.clientX : event.clientY,
    startSize: target === 'rail' ? railWidth.value : notesHeight.value,
    target,
  }

  window.addEventListener('pointermove', handleResize)
  window.addEventListener('pointerup', finishResize)
  window.addEventListener('pointercancel', finishResize)
}

function handleResize(event: PointerEvent) {
  const session = resizeSession.value
  if (!session || event.pointerId !== session.pointerId)
    return

  event.preventDefault()

  if (session.target === 'rail')
    setRailWidth(session.startSize + event.clientX - session.startPosition, false)
  else
    setNotesHeight(session.startSize + session.startPosition - event.clientY, false)
}

function finishResize(event?: PointerEvent) {
  const session = resizeSession.value
  if (!session || (event && event.pointerId !== session.pointerId))
    return

  const resizedTarget = session.target
  resizeSession.value = undefined
  window.removeEventListener('pointermove', handleResize)
  window.removeEventListener('pointerup', finishResize)
  window.removeEventListener('pointercancel', finishResize)
  document.body.style.cursor = previousBodyCursor
  document.body.style.userSelect = previousBodyUserSelect
  persistPresenterLayout()

  if (resizedTarget === 'rail') {
    nextTick(() => {
      measureThumbViewport()
      ensureCurrentThumbVisible(currentSlideNo.value)
    })
  }
}

function handleRailResizeKeydown(event: KeyboardEvent) {
  if (event.key === 'Home') {
    event.preventDefault()
    resetRailWidth()
  }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    setRailWidth(railWidth.value + (event.key === 'ArrowLeft' ? -16 : 16))
  }
}

function handleNotesResizeKeydown(event: KeyboardEvent) {
  if (event.key === 'Home') {
    event.preventDefault()
    resetNotesHeight()
  }
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    setNotesHeight(notesHeight.value + (event.key === 'ArrowUp' ? 16 : -16))
  }
}

function getCanvasMetrics(zoom = slideZoom.value) {
  const viewport = canvasViewport.value
  const baseWidth = canvasBoundsWidth.value || viewport?.clientWidth || 0
  const baseHeight = canvasBoundsHeight.value || viewport?.clientHeight || 0
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

function toggleNotesCollapsed() {
  notesCollapsed.value = !notesCollapsed.value
  if (notesCollapsed.value)
    notesEditing.value = false
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
  if (!resizeSession.value)
    document.body.style.cursor = ''
}

function updateCompactLayout() {
  if (typeof window === 'undefined')
    return

  if (resizeSession.value)
    finishResize()

  isCompactLayout.value = window.innerWidth <= 960
  constrainPresenterLayout()
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

  const currentItem = thumbnailLayout.value.items.find(item =>
    item.kind === 'slide' && item.route.no === no,
  )
  if (!currentItem)
    return

  const currentTop = currentItem.top
  const currentBottom = currentTop + currentItem.height
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
    if (currentSectionId.value && isSectionCollapsed(currentSectionId.value)) {
      const next = new Set(collapsedSectionIds.value)
      next.delete(currentSectionId.value)
      collapsedSectionIds.value = next
    }

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
  window.addEventListener('resize', updateCompactLayout, { passive: true })

  if (typeof ResizeObserver !== 'undefined' && thumbViewport.value) {
    thumbViewportObserver = new ResizeObserver(() => measureThumbViewport())
    thumbViewportObserver.observe(thumbViewport.value)
  }
})

onBeforeUnmount(() => {
  if (resizeSession.value)
    finishResize()
  document.body.removeEventListener('pointermove', restoreCursor)
  document.body.removeEventListener('pointerdown', restoreCursor)
  restoreCursor()
  compactLayoutMedia?.removeEventListener('change', updateCompactLayout)
  window.removeEventListener('resize', updateCompactLayout)
  thumbViewportObserver?.disconnect()
})
</script>

<template>
  <div
    class="sidebar-presenter"
    :class="{ 'is-dark': isDark, 'is-resizing': resizeSession }"
    :style="presenterStyle"
  >
    <aside class="sidebar-presenter__rail">
      <div class="sidebar-presenter__rail-head">
        <h1 class="sidebar-presenter__heading">
          {{ presenterTitle }}
        </h1>
      </div>

      <div
        ref="thumbViewport"
        class="sidebar-presenter__thumbs"
        @scroll.passive="handleThumbScroll"
      >
        <div
          class="sidebar-presenter__thumbs-spacer"
          :style="thumbnailListStyle"
        >
          <div
            v-for="item in visibleThumbnailItems"
            :key="item.key"
            class="sidebar-presenter__thumb-item"
            :class="`is-${item.kind}`"
            :style="getThumbnailItemStyle(item)"
          >
            <button
              v-if="item.kind === 'section'"
              type="button"
              class="sidebar-presenter__section"
              :class="{ 'is-active': item.section.id === currentSectionId }"
              :aria-expanded="!isSectionCollapsed(item.section.id)"
              @click="toggleSection(item.section.id)"
            >
              <span
                class="sidebar-presenter__section-chevron"
                :class="isSectionCollapsed(item.section.id) ? 'i-carbon:chevron-right' : 'i-carbon:chevron-down'"
              />
              <span class="sidebar-presenter__section-title">
                {{ item.section.title }}
              </span>
              <span class="sidebar-presenter__section-count">
                {{ item.section.slides.length }}
              </span>
            </button>

            <button
              v-else
              type="button"
              class="sidebar-presenter__thumb"
              :class="{ 'is-active': item.route.no === currentSlideNo }"
              :data-slide-no="item.route.no"
              @click="goSidebar(item.route.no)"
            >
              <div class="sidebar-presenter__thumb-meta">
                <span>{{ item.route.no }}</span>
                <span class="sidebar-presenter__thumb-title">
                  {{ getSlideTitle(item.route) }}
                </span>
              </div>
              <div class="sidebar-presenter__thumb-frame" :style="thumbFrameStyle">
                <SlideContainer
                  :key="item.route.no"
                  :width="thumbWidth"
                  class="pointer-events-none important:[&_*]:select-none"
                >
                  <SlideWrapper
                    :clicks-context="getThumbnailClicks(item.route)"
                    :route="item.route"
                    render-context="overview"
                  />
                  <DrawingPreview :page="item.route.no" />
                </SlideContainer>
              </div>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <div
      class="sidebar-presenter__rail-resizer"
      role="separator"
      aria-label="Resize slide pane"
      aria-orientation="vertical"
      :aria-valuemin="SIDEBAR_PRESENTER_MIN_RAIL_WIDTH"
      :aria-valuemax="getRailWidthMax()"
      :aria-valuenow="railWidth"
      tabindex="0"
      title="Drag to resize · Double-click to reset"
      @dblclick="resetRailWidth"
      @keydown="handleRailResizeKeydown"
      @pointerdown="beginResize('rail', $event)"
    >
      <span />
    </div>

    <main ref="main" class="sidebar-presenter__main">
      <section class="sidebar-presenter__canvas-wrap">
        <div
          ref="canvasSurface"
          class="sidebar-presenter__canvas-surface"
        >
          <div
            ref="canvasBounds"
            class="sidebar-presenter__canvas-bounds"
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
        </div>

        <ClicksSlider
          :key="currentSlideRoute?.no"
          :clicks-context="getPrimaryClicks(currentSlideRoute)"
          class="sidebar-presenter__clicks"
        />
      </section>

      <section class="sidebar-presenter__notes" :class="{ 'is-collapsed': notesCollapsed }">
        <div
          v-if="!notesCollapsed"
          class="sidebar-presenter__notes-resizer"
          role="separator"
          aria-label="Resize notes pane"
          aria-orientation="horizontal"
          :aria-valuemin="SIDEBAR_PRESENTER_MIN_NOTES_HEIGHT"
          :aria-valuemax="getNotesHeightMax()"
          :aria-valuenow="notesHeight"
          tabindex="0"
          title="Drag to resize · Double-click to reset"
          @dblclick="resetNotesHeight"
          @keydown="handleNotesResizeKeydown"
          @pointerdown="beginResize('notes', $event)"
        >
          <span />
        </div>
        <div class="sidebar-presenter__notes-head">
          <p class="sidebar-presenter__eyebrow">
            Notes
          </p>
          <div class="sidebar-presenter__notes-actions">
            <button
              type="button"
              class="sidebar-presenter__notes-toggle"
              :title="notesCollapsed ? 'Expand notes' : 'Collapse notes'"
              :aria-label="notesCollapsed ? 'Expand notes' : 'Collapse notes'"
              :aria-pressed="!notesCollapsed"
              @click="toggleNotesCollapsed"
            >
              <div :class="notesCollapsed ? 'i-carbon:chevron-up' : 'i-carbon:chevron-down'" />
            </button>
            <button
              v-if="__DEV__ && !notesCollapsed"
              type="button"
              class="sidebar-presenter__toggle sidebar-presenter__toggle--soft sidebar-presenter__toggle--compact"
              :aria-pressed="notesEditing"
              @click="notesEditing = !notesEditing"
            >
              {{ notesEditing ? 'Done' : 'Edit Notes' }}
            </button>
          </div>
        </div>
        <div v-show="!notesCollapsed" class="sidebar-presenter__notes-body">
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
  --sidebar-surface: rgba(255, 255, 255, 0.92);
  --sidebar-surface-strong: rgba(255, 255, 255, 0.98);
  --sidebar-head-bg: rgba(255, 255, 255, 0.66);
  --sidebar-border: rgba(17, 17, 17, 0.08);
  --sidebar-border-strong: rgba(17, 17, 17, 0.16);
  --sidebar-shadow: 0 18px 40px rgba(17, 17, 17, 0.08);
  --sidebar-ink: #111111;
  --sidebar-ink-soft: rgba(17, 17, 17, 0.58);
  --sidebar-accent: #111111;
  --sidebar-rail-bg: rgba(250, 250, 250, 0.92);
  --sidebar-soft-button-bg: rgba(245, 245, 245, 0.92);
  --sidebar-thumb-hover: rgba(17, 17, 17, 0.035);
  --sidebar-thumb-frame-bg: #ffffff;
  --sidebar-notes-bg: rgba(250, 250, 250, 0.92);
  --sidebar-notes-display-bg: rgba(255, 255, 255, 0.82);
  --sidebar-progress-track: rgba(17, 17, 17, 0.08);
  --sidebar-progress-fill: linear-gradient(90deg, #111111, #3a3a3a);
  --sidebar-scrollbar-track: rgba(17, 17, 17, 0.05);
  --sidebar-scrollbar-thumb: rgba(17, 17, 17, 0.18);
  --sidebar-scrollbar-thumb-hover: rgba(17, 17, 17, 0.28);
  --sidebar-thumb-row-height: 180px;
  display: grid;
  grid-template-columns: var(--sidebar-rail-width, 286px) 7px minmax(0, 1fr);
  height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, #f6f6f7 100%);
  color: var(--sidebar-ink);
}

.sidebar-presenter.is-resizing {
  cursor: inherit;
}

.sidebar-presenter.is-dark {
  --sidebar-surface: rgba(20, 20, 21, 0.94);
  --sidebar-surface-strong: rgba(28, 28, 30, 0.98);
  --sidebar-head-bg: rgba(20, 20, 21, 0.74);
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-border-strong: rgba(255, 255, 255, 0.16);
  --sidebar-shadow: 0 24px 56px rgba(0, 0, 0, 0.32);
  --sidebar-ink: #f5f5f5;
  --sidebar-ink-soft: rgba(245, 245, 245, 0.6);
  --sidebar-accent: #f5f5f5;
  --sidebar-rail-bg: rgba(16, 16, 17, 0.94);
  --sidebar-soft-button-bg: rgba(34, 34, 36, 0.92);
  --sidebar-thumb-hover: rgba(255, 255, 255, 0.05);
  --sidebar-thumb-frame-bg: rgba(10, 10, 11, 0.92);
  --sidebar-notes-bg: rgba(20, 20, 21, 0.94);
  --sidebar-notes-display-bg: rgba(14, 14, 15, 0.84);
  --sidebar-progress-track: rgba(255, 255, 255, 0.12);
  --sidebar-progress-fill: linear-gradient(90deg, #f5f5f5, #8d8d93);
  --sidebar-scrollbar-track: rgba(255, 255, 255, 0.05);
  --sidebar-scrollbar-thumb: rgba(255, 255, 255, 0.18);
  --sidebar-scrollbar-thumb-hover: rgba(255, 255, 255, 0.28);
  background: linear-gradient(180deg, #0d0d0e 0%, #141416 100%);
}

.sidebar-presenter__rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  background: var(--sidebar-rail-bg);
  backdrop-filter: blur(18px);
}

.sidebar-presenter__rail-resizer {
  position: relative;
  z-index: 4;
  display: flex;
  min-width: 7px;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--sidebar-border);
  border-left: 1px solid var(--sidebar-border);
  background: var(--sidebar-rail-bg);
  cursor: col-resize;
  touch-action: none;
}

.sidebar-presenter__rail-resizer span {
  width: 2px;
  height: 2.5rem;
  border-radius: 999px;
  background: var(--sidebar-border-strong);
  opacity: 0;
  transition:
    height 150ms ease,
    opacity 150ms ease,
    background-color 150ms ease;
}

.sidebar-presenter__rail-resizer:hover span,
.sidebar-presenter__rail-resizer:focus-visible span,
.sidebar-presenter.is-resizing .sidebar-presenter__rail-resizer span {
  height: 4rem;
  background: var(--sidebar-ink-soft);
  opacity: 1;
}

.sidebar-presenter__rail-resizer:focus-visible,
.sidebar-presenter__notes-resizer:focus-visible {
  outline: 2px solid var(--sidebar-ink-soft);
  outline-offset: -2px;
}

.sidebar-presenter__rail-head,
.sidebar-presenter__main-head,
.sidebar-presenter__notes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.sidebar-presenter__rail-head {
  padding: 0.85rem 0.95rem 0.8rem;
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
  margin: 0;
  line-height: 1;
  letter-spacing: -0.03em;
}

.sidebar-presenter__heading {
  font-size: 1.05rem;
  font-weight: 600;
}

.sidebar-presenter__toggle {
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  background: var(--sidebar-accent);
  color: #ffffff;
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
  padding: 0 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--sidebar-scrollbar-thumb) var(--sidebar-scrollbar-track);
}

.sidebar-presenter__thumbs-spacer {
  position: relative;
}

.sidebar-presenter__thumb-item {
  position: absolute;
  left: 0;
  right: 0;
}

.sidebar-presenter__section {
  display: flex;
  width: 100%;
  height: 36px;
  align-items: center;
  gap: 0.42rem;
  padding: 0 0.52rem;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--sidebar-ink-soft);
  text-align: left;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.sidebar-presenter__section:hover {
  background: var(--sidebar-thumb-hover);
  color: var(--sidebar-ink);
}

.sidebar-presenter__section.is-active {
  color: var(--sidebar-ink);
}

.sidebar-presenter__section-chevron {
  width: 0.85rem;
  min-width: 0.85rem;
  height: 0.85rem;
  opacity: 0.72;
}

.sidebar-presenter__section-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 0.75rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-presenter__section-count {
  display: inline-flex;
  min-width: 1.3rem;
  height: 1.3rem;
  align-items: center;
  justify-content: center;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--sidebar-thumb-hover);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  color: var(--sidebar-ink-soft);
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
  align-self: center;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--sidebar-border);
  background: var(--sidebar-thumb-frame-bg);
}

.sidebar-presenter__main {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  min-width: 0;
  padding: 0.5rem 0.82rem 0;
  gap: 0.5rem;
}

.sidebar-presenter__canvas-wrap {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: var(--sidebar-surface);
  box-shadow: var(--sidebar-shadow);
  overflow: hidden;
}

.sidebar-presenter__canvas-surface {
  position: relative;
  height: 100%;
  min-height: 0;
}

.sidebar-presenter__canvas-bounds {
  position: absolute;
  inset: 0.45rem 0.56rem 0.24rem;
  overflow: hidden;
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
  padding: 0 0.62rem 0.56rem;
}

.sidebar-presenter__notes {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: var(--sidebar-notes-height, clamp(9rem, 22vh, 15rem));
  min-height: 0;
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: var(--sidebar-notes-bg);
  margin-top: 0.5rem;
  padding: 0.58rem 0.68rem 0.68rem;
}

.sidebar-presenter__notes.is-collapsed {
  grid-template-rows: auto;
  height: auto;
  padding-bottom: 0.58rem;
}

.sidebar-presenter__notes-resizer {
  position: absolute;
  z-index: 4;
  top: -0.58rem;
  right: 0.85rem;
  left: 0.85rem;
  display: flex;
  height: 0.58rem;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  touch-action: none;
}

.sidebar-presenter__notes-resizer span {
  width: 2.6rem;
  height: 2px;
  border-radius: 999px;
  background: var(--sidebar-border-strong);
  opacity: 0;
  transition:
    opacity 150ms ease,
    width 150ms ease,
    background-color 150ms ease;
}

.sidebar-presenter__notes-resizer:hover span,
.sidebar-presenter__notes-resizer:focus-visible span,
.sidebar-presenter.is-resizing .sidebar-presenter__notes-resizer span {
  width: 4rem;
  background: var(--sidebar-ink-soft);
  opacity: 1;
}

.sidebar-presenter__notes-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.sidebar-presenter__notes-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  min-width: 1.85rem;
  height: 1.85rem;
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  background: var(--sidebar-soft-button-bg);
  color: var(--sidebar-ink);
  font-size: 0.82rem;
  transition:
    transform 150ms ease,
    background-color 150ms ease,
    border-color 150ms ease;
}

.sidebar-presenter__notes-toggle:hover {
  transform: translateY(-1px);
  background: var(--sidebar-thumb-hover);
}

.sidebar-presenter__notes-body {
  min-height: 0;
  overflow: hidden;
  margin-top: 0.38rem;
}

.sidebar-presenter__notes-display {
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: auto;
  padding: 0.62rem 0.7rem;
  border-radius: 12px;
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
  margin-top: 0.4rem;
  margin-bottom: 0.55rem;
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

  .sidebar-presenter__rail-resizer,
  .sidebar-presenter__notes-resizer {
    display: none;
  }

  .sidebar-presenter__thumbs-spacer,
  .sidebar-presenter__thumb-item {
    position: static;
    height: auto;
  }

  .sidebar-presenter__rail {
    border-right: none;
    border-bottom: 1px solid var(--sidebar-border);
  }

  .sidebar-presenter__thumbs {
    overflow-x: auto;
    overflow-y: hidden;
  }

  .sidebar-presenter__thumbs-spacer {
    display: flex;
    width: max-content;
    min-width: 100%;
    height: 100%;
    align-items: stretch;
    gap: 0.75rem;
    padding: 0.75rem 0 1rem;
  }

  .sidebar-presenter__thumb-item.is-section {
    display: flex;
    width: 154px;
    min-width: 154px;
    align-items: stretch;
  }

  .sidebar-presenter__section {
    height: auto;
    align-items: center;
    border-color: var(--sidebar-border);
    background: var(--sidebar-surface);
  }

  .sidebar-presenter__section-title {
    white-space: normal;
  }

  .sidebar-presenter__thumb {
    height: auto;
    width: 220px;
    min-width: 220px;
    margin-bottom: 0;
  }

  .sidebar-presenter__main {
    padding: 0.56rem;
  }
}
</style>
