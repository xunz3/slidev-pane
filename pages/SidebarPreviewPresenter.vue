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
import { isColorSchemaConfigured, isDark, toggleDark } from '@slidev/client/logic/dark.ts'
import { registerShortcuts } from '@slidev/client/logic/shortcuts.ts'
import { showGotoDialog, showOverview, toggleOverview } from '@slidev/client/state/index.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SidebarGoto from '../components/SidebarGoto.vue'
import SidebarNavControls from '../components/SidebarNavControls.vue'
import SidebarQuickOverview from '../components/SidebarQuickOverview.vue'
import '../components/pane-ui.css'
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
  canZoomIn,
  canZoomOut,
  getWheelZoomTarget,
  resetSlideZoom,
  setSlideZoom,
  slideZoom,
  zoomPercentage,
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
const deckTitle = slidesTitle.replace(/\s*-\s*Slidev\s*$/, '').trim()

const defaultThumbWidth = 144
const thumbOverscan = 4
const sectionHeaderHeight = 36
const thumbViewportPaddingTop = 10
const thumbViewportPaddingBottom = 20
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

const currentClicksTotal = computed(() => currentSlideRoute.value
  ? getPrimaryClicks(currentSlideRoute.value).total
  : 0)

function formatSlideNo(no: number) {
  return String(no).padStart(2, '0')
}

const thumbWidth = computed(() => isCompactLayout.value
  ? defaultThumbWidth
  : Math.round(clampBetween(railWidth.value - 60, 176, 360)))
const thumbFrameHeight = computed(() => Math.ceil(thumbWidth.value / slideAspect.value))
const thumbRowHeight = computed(() => thumbFrameHeight.value + 54)
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
const canvasFitWidth = computed(() => Math.min(canvasBoundsWidth.value, canvasBoundsHeight.value * slideAspect.value))
const canvasFitHeight = computed(() => canvasFitWidth.value / slideAspect.value)
const canvasFrameStyle = computed(() => {
  if (!canvasBoundsWidth.value || !canvasBoundsHeight.value)
    return {}

  return {
    width: `${Math.max(canvasBoundsWidth.value, canvasFitWidth.value * slideZoom.value)}px`,
    height: `${Math.max(canvasBoundsHeight.value, canvasFitHeight.value * slideZoom.value)}px`,
  }
})
const canvasStyle = computed(() => {
  if (!canvasBoundsWidth.value || !canvasBoundsHeight.value)
    return {}

  return {
    width: `${canvasFitWidth.value * slideZoom.value}px`,
    height: `${canvasFitHeight.value * slideZoom.value}px`,
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
  const baseWidth = canvasFitWidth.value
  const baseHeight = canvasFitHeight.value
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

function zoomCanvas(direction: -1 | 1) {
  focusCanvasZoom(slideZoom.value + direction * SIDEBAR_PRESENTER_ZOOM_STEP)
}

function resetCanvasZoom() {
  resetSlideZoom()
  nextTick(() => canvasViewport.value?.scrollTo({ left: 0, top: 0 }))
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
  nextTick(() => ensureCurrentThumbVisible(currentSlideNo.value))
}

function measureThumbViewport() {
  thumbViewportHeight.value = thumbViewport.value?.clientHeight || 0
}

function handleThumbScroll() {
  thumbScrollTop.value = thumbViewport.value?.scrollTop || 0
}

function ensureCurrentThumbVisible(no: number) {
  const viewport = thumbViewport.value

  if (!viewport)
    return

  if (isCompactLayout.value) {
    const currentThumb = viewport.querySelector<HTMLElement>(`[data-slide-no="${no}"]`)
    // The compact rail is horizontal on phones and vertical in short landscape windows.
    currentThumb?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return
  }

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
    class="sidebar-presenter pane-ui"
    :class="{ 'is-dark': isDark, 'is-resizing': resizeSession }"
    :style="presenterStyle"
    :inert="showGotoDialog || showOverview"
  >
    <header class="sidebar-presenter__header">
      <div class="sidebar-presenter__document">
        <span :title="deckTitle">{{ deckTitle }}</span>
      </div>
      <div class="sidebar-presenter__header-actions">
        <button
          type="button"
          class="sidebar-presenter__search"
          aria-label="Find a slide"
          title="Find a slide (G)"
          @click="showGotoDialog = true"
        >
          <span class="i-carbon:search" aria-hidden="true" />
        </button>
        <button
          v-if="!isColorSchemaConfigured"
          type="button"
          class="sidebar-presenter__theme"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleDark()"
        >
          <span :class="isDark ? 'i-carbon:sun' : 'i-carbon:moon'" aria-hidden="true" />
        </button>
      </div>
    </header>

    <aside class="sidebar-presenter__rail" aria-label="Slide navigator">
      <header class="sidebar-presenter__rail-head">
        <div class="sidebar-presenter__rail-label">
          <h2>Slides</h2>
          <span>{{ total }}</span>
        </div>
        <button
          type="button"
          class="sidebar-presenter__overview-button"
          title="Slide overview (O)"
          aria-label="Show slide overview"
          @click="toggleOverview()"
        >
          <span class="i-carbon:grid" aria-hidden="true" />
        </button>
      </header>
      <div ref="thumbViewport" class="sidebar-presenter__thumbs" @scroll.passive="handleThumbScroll">
        <div class="sidebar-presenter__thumbs-spacer" :style="thumbnailListStyle">
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
                :class="
                  isSectionCollapsed(item.section.id) ? 'i-carbon:chevron-right' : 'i-carbon:chevron-down'
                "
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
              :aria-label="`Slide ${item.route.no}: ${getSlideTitle(item.route)}`"
              :aria-current="item.route.no === currentSlideNo ? 'page' : undefined"
              @click="goSidebar(item.route.no)"
            >
              <div class="sidebar-presenter__thumb-frame" :style="thumbFrameStyle" inert aria-hidden="true">
                <!-- Fit the measured frame: padding and scrollbars can make it narrower than thumbWidth. -->
                <SlideContainer
                  :key="item.route.no"
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
              <div class="sidebar-presenter__thumb-meta">
                <span class="sidebar-presenter__thumb-number">{{ formatSlideNo(item.route.no) }}</span>
                <span class="sidebar-presenter__thumb-title">
                  {{ getSlideTitle(item.route) }}
                </span>
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
      @keydown.stop="handleRailResizeKeydown"
      @pointerdown="beginResize('rail', $event)"
    >
      <span />
    </div>

    <main ref="main" class="sidebar-presenter__main">
      <section class="sidebar-presenter__canvas-wrap">
        <div ref="canvasSurface" class="sidebar-presenter__canvas-surface">
          <div ref="canvasBounds" class="sidebar-presenter__canvas-bounds">
            <div ref="canvasViewport" class="sidebar-presenter__canvas-viewport" @wheel="handleCanvasWheel">
              <div class="sidebar-presenter__canvas-stage" :style="canvasFrameStyle">
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
          v-if="currentClicksTotal > 0"
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
          @keydown.stop="handleNotesResizeKeydown"
          @pointerdown="beginResize('notes', $event)"
        >
          <span />
        </div>
        <div class="sidebar-presenter__notes-head">
          <div class="sidebar-presenter__notes-title">
            <p class="sidebar-presenter__eyebrow">Notes</p>
          </div>
          <div class="sidebar-presenter__notes-actions">
            <template v-if="__DEV__ && !notesCollapsed">
              <button
                v-if="notesEditing"
                type="button"
                class="sidebar-presenter__toggle"
                aria-pressed="true"
                @click="notesEditing = false"
              >
                Done
              </button>
              <button
                v-else
                type="button"
                class="sidebar-presenter__toggle"
                aria-pressed="false"
                @click="notesEditing = true"
              >
                Edit
              </button>
            </template>
            <button
              type="button"
              class="sidebar-presenter__notes-toggle"
              :title="notesCollapsed ? 'Expand notes' : 'Collapse notes'"
              :aria-label="notesCollapsed ? 'Expand notes' : 'Collapse notes'"
              :aria-expanded="!notesCollapsed"
              aria-controls="pane-notes-body"
              @click="toggleNotesCollapsed"
            >
              <div :class="notesCollapsed ? 'i-carbon:chevron-up' : 'i-carbon:chevron-down'" />
            </button>
          </div>
        </div>
        <div v-show="!notesCollapsed" id="pane-notes-body" class="sidebar-presenter__notes-body">
          <NoteEditable
            v-if="__DEV__"
            :key="`edit-${currentSlideNo}`"
            v-model:editing="notesEditing"
            :no="currentSlideNo"
            aria-label="Notes"
            class="sidebar-presenter__notes-display"
            :clicks-context="clicksContext"
            placeholder="Add notes…"
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

      <SidebarNavControls>
        <template #leading>
          <div class="sidebar-presenter__zoom" role="group" aria-label="Slide zoom">
            <button
              type="button"
              :disabled="!canZoomOut"
              title="Zoom out"
              aria-label="Zoom out"
              @click="zoomCanvas(-1)"
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              type="button"
              class="sidebar-presenter__zoom-value"
              :class="{ 'is-default': slideZoom === SIDEBAR_PRESENTER_DEFAULT_ZOOM }"
              title="Reset zoom"
              aria-label="Reset slide zoom"
              @click="resetCanvasZoom"
            >
              {{ zoomPercentage }}
            </button>
            <button
              type="button"
              :disabled="!canZoomIn"
              title="Zoom in"
              aria-label="Zoom in"
              @click="zoomCanvas(1)"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </template>
      </SidebarNavControls>
    </main>
  </div>

  <SidebarGoto />
  <SidebarQuickOverview />
  <ContextMenu />
  <DrawingControls v-if="__SLIDEV_FEATURE_DRAWINGS__" />
</template>

<style scoped>
.sidebar-presenter {
  display: grid;
  grid-template-columns: var(--sidebar-rail-width, 252px) 6px minmax(0, 1fr);
  grid-template-rows: 52px minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--pane-bg);
}

.sidebar-presenter,
.sidebar-presenter * {
  box-sizing: border-box;
}
.sidebar-presenter button {
  font-family: inherit;
  cursor: pointer;
}
.sidebar-presenter button:focus-visible,
.sidebar-presenter [role='separator']:focus-visible {
  outline: 2px solid var(--pane-accent);
  outline-offset: 3px;
}
.sidebar-presenter button:disabled {
  cursor: default;
}

.sidebar-presenter__header {
  z-index: 8;
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 24px;
  min-width: 0;
  padding: 0 24px 0 20px;
  border-bottom: 1px solid var(--pane-line);
  background: var(--pane-surface);
}

.sidebar-presenter__document {
  min-width: 0;
  flex: 1;
  font-family: var(--pane-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
}
.sidebar-presenter__document > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-presenter__header-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
.sidebar-presenter__search,
.sidebar-presenter__theme {
  display: inline-flex;
  height: 30px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--pane-muted);
  font-size: 12px;
  transition:
    background 160ms,
    color 160ms;
}
.sidebar-presenter__search,
.sidebar-presenter__theme {
  width: 30px;
  padding: 0;
  font-size: 16px;
}
.sidebar-presenter__search:hover,
.sidebar-presenter__theme:hover {
  background: var(--pane-hover);
  color: var(--pane-ink);
}

.sidebar-presenter__rail {
  z-index: 5;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--pane-line);
  background: var(--pane-surface);
}
.sidebar-presenter__rail-head {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
}
.sidebar-presenter__rail-label {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--pane-muted);
  font-size: 15px;
}
.sidebar-presenter__rail-label h2 {
  margin: 0;
  color: var(--pane-ink);
  font-size: 12px;
  font-weight: 600;
}
.sidebar-presenter__rail-label > span:last-child {
  padding-left: 2px;
  color: var(--pane-muted);
  font: 10px var(--pane-mono);
}
.sidebar-presenter__overview-button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pane-muted);
}
.sidebar-presenter__overview-button:hover {
  background: var(--pane-hover);
  color: var(--pane-ink);
}

.sidebar-presenter__rail-resizer {
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  touch-action: none;
}
.sidebar-presenter__rail-resizer span {
  width: 2px;
  height: 28px;
  border-radius: 2px;
  background: var(--pane-line-strong);
  transition:
    background 160ms,
    height 160ms;
}
.sidebar-presenter__rail-resizer:hover span,
.sidebar-presenter__rail-resizer:focus-visible span,
.sidebar-presenter.is-resizing .sidebar-presenter__rail-resizer span {
  height: 52px;
  background: var(--pane-accent);
}

.sidebar-presenter__thumbs {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
  scrollbar-color: var(--pane-line-strong) transparent;
  scrollbar-width: thin;
}
.sidebar-presenter__thumbs-spacer {
  position: relative;
}
.sidebar-presenter__thumb-item {
  position: absolute;
  right: 0;
  left: 0;
}
.sidebar-presenter__section {
  display: flex;
  width: 100%;
  height: 36px;
  align-items: center;
  gap: 7px;
  padding: 0 7px;
  border: 0;
  background: transparent;
  color: var(--pane-muted);
  text-align: left;
}
.sidebar-presenter__section:hover {
  color: var(--pane-ink);
}
.sidebar-presenter__section-chevron {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}
.sidebar-presenter__section-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-presenter__section-count {
  color: var(--pane-faint);
  font: 10px var(--pane-mono);
}
.sidebar-presenter__thumb {
  display: flex;
  width: 100%;
  height: calc(var(--sidebar-thumb-row-height) - 6px);
  flex-direction: column;
  gap: 8px;
  align-items: center;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--pane-muted);
  text-align: left;
  transition:
    background 160ms,
    border-color 160ms;
}
.sidebar-presenter__thumb:hover {
  background: var(--pane-hover);
}
.sidebar-presenter__thumb.is-active {
  background: var(--pane-accent-soft);
  color: var(--pane-accent);
}
.sidebar-presenter__thumb-meta {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  line-height: 18px;
}
.sidebar-presenter__thumb-number {
  min-width: 24px;
  border-radius: 4px;
  color: var(--pane-faint);
  font: 10px/18px var(--pane-mono);
  text-align: center;
}
.sidebar-presenter__thumb.is-active .sidebar-presenter__thumb-number {
  color: var(--pane-accent);
  font-weight: 600;
}
.sidebar-presenter__thumb-title {
  overflow: hidden;
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-presenter__thumb-frame {
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--pane-line-strong);
  border-radius: 4px;
  background: var(--pane-raised);
  box-shadow: 0 2px 3px rgb(28 26 22 / 4%);
}
.sidebar-presenter__thumb.is-active .sidebar-presenter__thumb-frame {
  border-color: var(--pane-accent);
}

.sidebar-presenter__main {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  min-width: 0;
  min-height: 0;
  /* The canvas and notes clip their own content; allow the tools popover above the rail. */
  overflow: visible;
}
.sidebar-presenter__canvas-wrap {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}
.sidebar-presenter__canvas-surface {
  position: relative;
  min-height: 0;
  background: var(--pane-stage);
}

.sidebar-presenter__zoom {
  display: grid;
  grid-template-columns: 26px 44px 26px;
  height: 28px;
}
.sidebar-presenter__zoom button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--pane-muted);
  font-size: 16px;
  transition: background 160ms;
}
.sidebar-presenter__zoom button:hover:not(:disabled) {
  background: var(--pane-hover);
  color: var(--pane-ink);
}
.sidebar-presenter__zoom button:disabled {
  opacity: 0.3;
}
.sidebar-presenter__zoom .sidebar-presenter__zoom-value {
  font: 10px var(--pane-mono);
}
.sidebar-presenter__zoom-value:not(.is-default) {
  color: var(--pane-accent);
}
.sidebar-presenter__canvas-bounds {
  position: absolute;
  inset: 24px 32px;
}
.sidebar-presenter__canvas-viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--pane-line-strong) transparent;
  scrollbar-width: thin;
}
.sidebar-presenter__canvas-stage {
  display: flex;
  min-width: 100%;
  min-height: 100%;
  align-items: center;
  justify-content: center;
}
.sidebar-presenter__canvas {
  border-radius: 5px;
  background: var(--pane-surface);
  box-shadow: var(--pane-shadow);
  cursor: auto;
}
.sidebar-presenter__clicks {
  min-height: 32px;
  padding: 4px 24px;
  border-top: 1px solid var(--pane-line);
  background: var(--pane-surface);
  color: var(--pane-muted);
  font: 11px var(--pane-mono);
}
.sidebar-presenter__clicks :deep(.text-primary) {
  color: var(--pane-accent);
}
.sidebar-presenter__clicks :deep(.bg-primary) {
  background: var(--pane-accent);
}

.sidebar-presenter__notes {
  position: relative;
  display: grid;
  height: var(--sidebar-notes-height, 128px);
  min-height: 0;
  grid-template-rows: 44px minmax(0, 1fr);
  border-top: 1px solid var(--pane-line);
  background: var(--pane-surface);
}
.sidebar-presenter__notes.is-collapsed {
  height: 44px;
  grid-template-rows: 44px;
}
.sidebar-presenter__notes-resizer {
  position: absolute;
  z-index: 4;
  top: -4px;
  right: 0;
  left: 0;
  display: flex;
  height: 8px;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  touch-action: none;
}
.sidebar-presenter__notes-resizer span {
  width: 32px;
  height: 3px;
  border-radius: 4px;
  background: var(--pane-line-strong);
  transition:
    width 160ms,
    background 160ms;
}
.sidebar-presenter__notes-resizer:hover span,
.sidebar-presenter__notes-resizer:focus-visible span,
.sidebar-presenter.is-resizing .sidebar-presenter__notes-resizer span {
  width: 56px;
  background: var(--pane-accent);
}
.sidebar-presenter__notes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
}
.sidebar-presenter__notes-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--pane-muted);
  font-size: 14px;
}
.sidebar-presenter__eyebrow {
  margin: 0;
  color: var(--pane-ink);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.sidebar-presenter__notes-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sidebar-presenter__notes-toggle,
.sidebar-presenter__toggle {
  display: inline-flex;
  height: 27px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--pane-muted);
  font-size: 11px;
}
.sidebar-presenter__notes-toggle {
  width: 27px;
}
.sidebar-presenter__toggle {
  padding: 0 8px;
}
.sidebar-presenter__notes-toggle:hover,
.sidebar-presenter__toggle:hover {
  background: var(--pane-hover);
  color: var(--pane-ink);
}
.sidebar-presenter__toggle[aria-pressed='true'] {
  background: var(--pane-accent-soft);
  color: var(--pane-accent);
}
.sidebar-presenter__notes-body {
  min-height: 0;
  overflow: hidden;
  padding: 0 24px 14px;
}
.sidebar-presenter__notes-display {
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--pane-muted);
  font: 13px/1.7 var(--pane-font);
  scrollbar-color: var(--pane-line-strong) transparent;
  scrollbar-width: thin;
}
.sidebar-presenter__notes-display:deep(p) {
  margin: 0 0 0.65em;
}
.sidebar-presenter__notes-display.opacity-25 {
  opacity: 1;
  color: var(--pane-faint);
  font-style: normal;
}
textarea.sidebar-presenter__notes-display {
  border-radius: 3px;
  outline: 2px solid var(--pane-accent-line);
  outline-offset: -2px;
  padding: 4px 8px;
  color: var(--pane-ink);
}

@media (max-width: 960px) {
  .sidebar-presenter {
    grid-template-columns: 1fr;
    grid-template-rows: 52px 214px minmax(0, 1fr);
  }
  .sidebar-presenter__header {
    padding: 0 16px;
  }

  .sidebar-presenter__rail-resizer,
  .sidebar-presenter__notes-resizer {
    display: none;
  }

  .sidebar-presenter__rail {
    border-right: 0;
    border-bottom: 1px solid var(--pane-line);
  }
  .sidebar-presenter__rail-head {
    min-height: 38px;
    padding: 0 16px;
  }
  .sidebar-presenter__thumbs {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 12px;
  }
  .sidebar-presenter__thumbs-spacer {
    display: flex;
    width: max-content;
    min-width: 100%;
    height: 100%;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0 8px;
  }
  .sidebar-presenter__thumb-item {
    position: static;
    height: auto;
  }
  .sidebar-presenter__thumb-item.is-section {
    width: 112px;
    min-width: 112px;
  }
  .sidebar-presenter__section {
    height: auto;
    align-items: flex-start;
    padding: 12px 4px;
  }
  .sidebar-presenter__section-title {
    white-space: normal;
  }
  .sidebar-presenter__thumb {
    width: 166px;
    min-width: 166px;
    height: auto;
    padding: 8px;
  }
  .sidebar-presenter__notes {
    height: min(var(--sidebar-notes-height), 20vh);
  }
  .sidebar-presenter__canvas-bounds {
    inset: 20px;
  }
}
@media (max-width: 640px) {
  .sidebar-presenter {
    grid-template-rows: 48px 204px minmax(0, 1fr);
  }
  .sidebar-presenter__header {
    gap: 10px;
    padding: 0 12px;
  }

  .sidebar-presenter__document {
    font-size: 12px;
  }
  .sidebar-presenter__header-actions {
    gap: 4px;
  }
  .sidebar-presenter__rail-head {
    min-height: 32px;
  }

  .sidebar-presenter__zoom {
    grid-template-columns: 22px 36px 22px;
  }
  .sidebar-presenter__canvas-bounds {
    inset: 16px 14px;
  }
  .sidebar-presenter__notes-head {
    padding: 0 14px;
  }
  .sidebar-presenter__notes-body {
    padding: 0 14px 10px;
  }
}
@media (max-height: 550px) and (max-width: 960px) {
  .sidebar-presenter {
    grid-template-rows: 48px minmax(0, 1fr);
    grid-template-columns: 190px minmax(0, 1fr);
  }
  .sidebar-presenter__rail {
    grid-row: 2;
  }
  .sidebar-presenter__thumbs {
    overflow: auto;
  }
  .sidebar-presenter__thumbs-spacer {
    display: block;
    width: auto;
    height: auto;
  }
  .sidebar-presenter__thumb-item.is-section {
    width: 100%;
  }
  .sidebar-presenter__thumb {
    margin-bottom: 8px;
  }
  .sidebar-presenter__notes {
    height: 76px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-presenter *,
  .sidebar-presenter *::before,
  .sidebar-presenter *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
</style>
