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

const defaultThumbWidth = 124
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

const progressWidth = computed(() => {
  if (!total.value)
    return '0%'
  return `${Math.min(100, (currentSlideNo.value / total.value) * 100)}%`
})
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
    if (!currentThumb)
      return

    const viewportRect = viewport.getBoundingClientRect()
    const thumbRect = currentThumb.getBoundingClientRect()
    const leftEdge = viewport.scrollLeft + thumbRect.left - viewportRect.left
    const rightEdge = leftEdge + thumbRect.width

    if (leftEdge < viewport.scrollLeft)
      viewport.scrollTo({ left: leftEdge })
    else if (rightEdge > viewport.scrollLeft + viewport.clientWidth)
      viewport.scrollTo({ left: rightEdge - viewport.clientWidth })

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
    class="sidebar-presenter"
    :class="{ 'is-dark': isDark, 'is-resizing': resizeSession }"
    :style="presenterStyle"
  >
    <aside class="sidebar-presenter__rail">
      <header class="sidebar-presenter__rail-head">
        <p>Navigator</p>
        <span>{{ formatSlideNo(total) }} slides</span>
      </header>
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
              :aria-current="item.route.no === currentSlideNo ? 'page' : undefined"
              @click="goSidebar(item.route.no)"
            >
              <div class="sidebar-presenter__thumb-meta">
                <span class="sidebar-presenter__thumb-number">{{ formatSlideNo(item.route.no) }}</span>
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
      <SidebarNavControls />
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
          @keydown="handleNotesResizeKeydown"
          @pointerdown="beginResize('notes', $event)"
        >
          <span />
        </div>
        <div class="sidebar-presenter__notes-head">
          <div class="sidebar-presenter__notes-title">
            <p class="sidebar-presenter__eyebrow">
              Notes
            </p>
            <span>Slide {{ formatSlideNo(currentSlideNo) }}</span>
          </div>
          <div class="sidebar-presenter__notes-actions">
            <button
              v-if="__DEV__ && !notesCollapsed"
              type="button"
              class="sidebar-presenter__toggle"
              :aria-pressed="notesEditing"
              @click="notesEditing = !notesEditing"
            >
              {{ notesEditing ? 'Done' : 'Edit' }}
            </button>
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

      <div
        class="sidebar-presenter__progress"
        role="progressbar"
        aria-label="Presentation progress"
        aria-valuemin="1"
        :aria-valuemax="total"
        :aria-valuenow="currentSlideNo"
      >
        <div class="sidebar-presenter__progress-bar" :style="{ width: progressWidth }" />
      </div>
    </main>
  </div>

  <SidebarGoto />
  <SidebarQuickOverview />
  <ContextMenu />
  <DrawingControls v-if="__SLIDEV_FEATURE_DRAWINGS__" />
</template>

<style scoped>
.sidebar-presenter {
  --pane-paper: #f1f3f0;
  --pane-rail: #e9ece9;
  --pane-stage: #f6f7f4;
  --pane-sheet: #fdfdfa;
  --pane-ink: #202925;
  --pane-ink-soft: #68736e;
  --pane-ink-faint: #919a95;
  --pane-line: rgba(32, 41, 37, 0.1);
  --pane-line-strong: rgba(32, 41, 37, 0.19);
  --pane-sage: #6f8980;
  --pane-sage-soft: rgba(111, 137, 128, 0.1);
  --pane-scrollbar: rgba(32, 41, 37, 0.16);
  --pane-scrollbar-hover: rgba(32, 41, 37, 0.29);
  --pane-font-sans: Inter, "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif;
  --sidebar-thumb-row-height: 180px;
  display: grid;
  grid-template-columns: var(--sidebar-rail-width, 252px) 7px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
  background: var(--pane-paper);
  color: var(--pane-ink);
  font-family: var(--pane-font-sans);
  -webkit-font-smoothing: antialiased;
}

.sidebar-presenter,
.sidebar-presenter * {
  box-sizing: border-box;
}

.sidebar-presenter button {
  font: inherit;
}

.sidebar-presenter button:focus-visible {
  outline: 1px solid var(--pane-sage);
  outline-offset: 2px;
}

.sidebar-presenter.is-resizing {
  cursor: inherit;
}

.sidebar-presenter.is-dark {
  --pane-paper: #1b2220;
  --pane-rail: #171e1c;
  --pane-stage: #212826;
  --pane-sheet: #28312e;
  --pane-ink: #e8ece9;
  --pane-ink-soft: #a7b0ab;
  --pane-ink-faint: #737d77;
  --pane-line: rgba(232, 236, 233, 0.1);
  --pane-line-strong: rgba(232, 236, 233, 0.19);
  --pane-sage: #92aba2;
  --pane-sage-soft: rgba(146, 171, 162, 0.1);
  --pane-scrollbar: rgba(232, 236, 233, 0.15);
  --pane-scrollbar-hover: rgba(232, 236, 233, 0.28);
}

.sidebar-presenter__rail {
  position: relative;
  z-index: 5;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: visible;
  border-right: 1px solid var(--pane-line-strong);
  background: var(--pane-rail);
}

.sidebar-presenter__rail-head {
  display: flex;
  min-height: 2.7rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.9rem 0 1rem;
  border-bottom: 1px solid var(--pane-line);
}

.sidebar-presenter__rail-head p,
.sidebar-presenter__rail-head span {
  margin: 0;
  font-size: 0.6rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.11em;
  line-height: 1;
  text-transform: uppercase;
}

.sidebar-presenter__rail-head p {
  color: var(--pane-ink-soft);
  font-weight: 650;
}

.sidebar-presenter__rail-head span {
  color: var(--pane-ink-faint);
}

.sidebar-presenter__eyebrow {
  margin: 0;
  color: var(--pane-ink-soft);
  font-size: 0.6rem;
  font-weight: 650;
  letter-spacing: 0.13em;
  line-height: 1;
  text-transform: uppercase;
}

.sidebar-presenter__rail-resizer {
  position: relative;
  z-index: 4;
  display: flex;
  min-width: 7px;
  align-items: center;
  justify-content: center;
  background: var(--pane-paper);
  cursor: col-resize;
  touch-action: none;
}

.sidebar-presenter__rail-resizer span {
  width: 1px;
  height: 2.5rem;
  background: var(--pane-line-strong);
  opacity: 0;
  transition: height 180ms ease, opacity 180ms ease, background-color 180ms ease;
}

.sidebar-presenter__rail-resizer:hover span,
.sidebar-presenter__rail-resizer:focus-visible span,
.sidebar-presenter.is-resizing .sidebar-presenter__rail-resizer span {
  height: 4rem;
  background: var(--pane-sage);
  opacity: 1;
}

.sidebar-presenter__rail-resizer:focus-visible,
.sidebar-presenter__notes-resizer:focus-visible {
  outline: 1px solid var(--pane-sage);
  outline-offset: -1px;
}

.sidebar-presenter__thumbs {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.75rem 0 0.8rem;
  scrollbar-color: var(--pane-scrollbar) transparent;
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
  gap: 0.42rem;
  padding: 0 0.2rem;
  border: 0;
  background: transparent;
  color: var(--pane-ink-soft);
  text-align: left;
  transition: color 180ms ease, opacity 180ms ease;
}

.sidebar-presenter__section:hover {
  color: var(--pane-ink);
}

.sidebar-presenter__section-chevron {
  width: 0.62rem;
  min-width: 0.62rem;
  height: 0.62rem;
  opacity: 0.55;
}

.sidebar-presenter__section-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 0.61rem;
  font-weight: 650;
  letter-spacing: 0.1em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.sidebar-presenter__section-count {
  min-width: 1.25rem;
  color: var(--pane-ink-faint);
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.sidebar-presenter__thumb {
  position: relative;
  display: flex;
  width: 100%;
  height: calc(var(--sidebar-thumb-row-height) - 4px);
  flex-direction: column;
  gap: 0.44rem;
  margin: 0;
  padding: 0.52rem 0.25rem 0.68rem 0.9rem;
  border: 0;
  background: transparent;
  text-align: left;
  transition: opacity 180ms ease, transform 180ms ease;
}

.sidebar-presenter__thumb::before {
  position: absolute;
  top: 0.55rem;
  bottom: 0.7rem;
  left: 0;
  width: 2px;
  background: var(--pane-sage);
  content: "";
  opacity: 0;
  transform: scaleY(0.55);
  transform-origin: center;
  transition: opacity 180ms ease, transform 180ms ease;
}

.sidebar-presenter__thumb:hover {
  transform: translateX(1px);
}

.sidebar-presenter__thumb.is-active::before {
  opacity: 1;
  transform: scaleY(1);
}

.sidebar-presenter__thumb-meta {
  display: grid;
  grid-template-columns: 1.8rem minmax(0, 1fr);
  align-items: baseline;
  color: var(--pane-ink-soft);
  font-size: 0.64rem;
}

.sidebar-presenter__thumb-number {
  color: var(--pane-ink-faint);
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.sidebar-presenter__thumb-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-presenter__thumb-frame {
  align-self: flex-start;
  overflow: hidden;
  border: 1px solid var(--pane-line);
  background: var(--pane-sheet);
  transition: border-color 180ms ease;
}

.sidebar-presenter__thumb:hover .sidebar-presenter__thumb-frame {
  border-color: var(--pane-line-strong);
}

.sidebar-presenter__main {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  min-width: 0;
  height: 100vh;
  padding: 0.7rem 0.85rem 0;
  overflow: hidden;
  background: var(--pane-paper);
}

.sidebar-presenter__zoom {
  position: absolute;
  z-index: 3;
  top: 0.34rem;
  right: 0.38rem;
  display: grid;
  grid-template-columns: 1.75rem 3rem 1.75rem;
  height: 1.85rem;
  opacity: 0.66;
  transition: opacity 180ms ease;
}

.sidebar-presenter__zoom button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--pane-ink-soft);
  font-size: 0.82rem;
  transition: color 180ms ease, background-color 180ms ease, transform 180ms ease;
}

.sidebar-presenter__zoom button:hover:not(:disabled) {
  background: var(--pane-sage-soft);
  color: var(--pane-ink);
  transform: translateY(-1px);
}

.sidebar-presenter__zoom button:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.sidebar-presenter__zoom .sidebar-presenter__zoom-value {
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.sidebar-presenter__canvas-wrap {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}

.sidebar-presenter__canvas-surface {
  position: relative;
  height: 100%;
  min-height: 0;
  background: var(--pane-stage);
}

.sidebar-presenter__canvas-bounds {
  position: absolute;
  inset: 2.25rem 0.4rem 0.4rem;
  overflow: hidden;
}

.sidebar-presenter__canvas-viewport {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--pane-scrollbar) transparent;
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
  outline: 1px solid var(--pane-line);
  background: var(--pane-sheet);
  cursor: auto;
}

.sidebar-presenter__clicks {
  min-height: 1.35rem;
  gap: 0.3rem !important;
  padding: 0.12rem 0.1rem 0.08rem;
  color: var(--pane-ink-faint);
  font-family: var(--pane-font-sans);
  font-size: 0.56rem;
}

.sidebar-presenter__clicks :deep(> div:first-child) {
  min-width: 3.4rem !important;
  gap: 0.15rem !important;
  margin-right: 0.15rem !important;
  font-family: var(--pane-font-sans) !important;
  font-variant-numeric: tabular-nums;
}

.sidebar-presenter__clicks :deep(> div:nth-child(2)) {
  height: 0.78rem !important;
  font-family: var(--pane-font-sans) !important;
}

.sidebar-presenter__clicks :deep(> div:nth-child(2) > div) {
  overflow: visible !important;
  border: 0 !important;
  border-bottom: 1px solid var(--pane-line) !important;
  border-radius: 0 !important;
  background: transparent !important;
}

.sidebar-presenter__clicks :deep(> div:nth-child(2) > div > div:first-child) {
  background: transparent !important;
  opacity: 0 !important;
}

.sidebar-presenter__clicks :deep(> div:nth-child(2) > div > [class~="z-1"]) {
  border: 0 !important;
  border-bottom: 1px solid transparent !important;
  border-radius: 0 !important;
  color: var(--pane-ink-faint);
  font-size: 0.53rem !important;
  font-weight: 400 !important;
}

.sidebar-presenter__clicks :deep(.text-primary) {
  border-bottom-color: var(--pane-sage) !important;
  color: var(--pane-sage) !important;
}

.sidebar-presenter__notes {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: var(--sidebar-notes-height, clamp(7rem, 13vh, 10.5rem));
  min-height: 0;
  margin-top: 0.65rem;
  border-top: 1px solid var(--pane-line);
  background: transparent;
}

.sidebar-presenter__notes.is-collapsed {
  grid-template-rows: auto;
  height: 2.35rem;
}

.sidebar-presenter__notes-resizer {
  position: absolute;
  z-index: 4;
  top: -0.35rem;
  right: 0;
  left: 0;
  display: flex;
  height: 0.7rem;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  touch-action: none;
}

.sidebar-presenter__notes-resizer span {
  width: 2.25rem;
  height: 1px;
  background: var(--pane-line-strong);
  opacity: 0;
  transition: opacity 180ms ease, width 180ms ease, background-color 180ms ease;
}

.sidebar-presenter__notes-resizer:hover span,
.sidebar-presenter__notes-resizer:focus-visible span,
.sidebar-presenter.is-resizing .sidebar-presenter__notes-resizer span {
  width: 4rem;
  background: var(--pane-sage);
  opacity: 1;
}

.sidebar-presenter__notes-head {
  display: flex;
  min-height: 2.35rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.sidebar-presenter__notes-title {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
}

.sidebar-presenter__notes-title > span {
  color: var(--pane-ink-faint);
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.sidebar-presenter__notes-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.sidebar-presenter__notes-toggle,
.sidebar-presenter__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.7rem;
  border: 0;
  background: transparent;
  color: var(--pane-ink-soft);
  transition: color 180ms ease, background-color 180ms ease, transform 180ms ease;
}

.sidebar-presenter__notes-toggle {
  width: 1.7rem;
  font-size: 0.68rem;
}

.sidebar-presenter__toggle {
  position: relative;
  padding: 0 0.45rem;
  font-size: 0.65rem;
}

.sidebar-presenter__toggle::after {
  position: absolute;
  right: 0.45rem;
  bottom: 0.25rem;
  left: 0.45rem;
  height: 1px;
  background: currentColor;
  content: "";
  opacity: 0;
  transform: scaleX(0.6);
  transition: opacity 180ms ease, transform 180ms ease;
}

.sidebar-presenter__notes-toggle:hover,
.sidebar-presenter__toggle:hover {
  background: var(--pane-sage-soft);
  color: var(--pane-ink);
  transform: translateY(-1px);
}

.sidebar-presenter__toggle:hover::after,
.sidebar-presenter__toggle[aria-pressed="true"]::after {
  opacity: 0.7;
  transform: scaleX(1);
}

.sidebar-presenter__notes-body {
  min-height: 0;
  overflow: hidden;
}

.sidebar-presenter__notes-display {
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: auto;
  padding: 0.15rem 0 0.65rem;
  background: transparent;
  color: var(--pane-ink-soft);
  font-family: var(--pane-font-sans);
  font-size: 0.78rem;
  line-height: 1.6;
  scrollbar-color: var(--pane-scrollbar) transparent;
  scrollbar-width: thin;
}

.sidebar-presenter__notes-display :deep(textarea) {
  background: transparent;
  color: var(--pane-ink);
  font-family: var(--pane-font-sans);
}

.sidebar-presenter__thumbs::-webkit-scrollbar,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar,
.sidebar-presenter__notes-display::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.sidebar-presenter__thumbs::-webkit-scrollbar-track,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar-track,
.sidebar-presenter__notes-display::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-presenter__thumbs::-webkit-scrollbar-thumb,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar-thumb,
.sidebar-presenter__notes-display::-webkit-scrollbar-thumb {
  background: var(--pane-scrollbar);
}

.sidebar-presenter__thumbs::-webkit-scrollbar-thumb:hover,
.sidebar-presenter__canvas-viewport::-webkit-scrollbar-thumb:hover,
.sidebar-presenter__notes-display::-webkit-scrollbar-thumb:hover {
  background: var(--pane-scrollbar-hover);
}

.sidebar-presenter__progress {
  height: 1px;
  margin: 0.45rem 0 0.7rem;
  background: var(--pane-line);
}

.sidebar-presenter__progress-bar {
  height: 1px;
  background: var(--pane-sage);
  transition: width 200ms ease;
}

@media (max-width: 960px) {
  .sidebar-presenter {
    grid-template-columns: 1fr;
    grid-template-rows: 210px minmax(0, 1fr);
  }

  .sidebar-presenter__rail-resizer,
  .sidebar-presenter__notes-resizer {
    display: none;
  }

  .sidebar-presenter__rail {
    border-right: 0;
    border-bottom: 1px solid var(--pane-line-strong);
  }

  .sidebar-presenter__thumbs {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 1.15rem;
  }

  .sidebar-presenter__thumbs-spacer,
  .sidebar-presenter__thumb-item {
    position: static;
    height: auto;
  }

  .sidebar-presenter__thumbs-spacer {
    display: flex;
    width: max-content;
    min-width: 100%;
    height: 100%;
    align-items: stretch;
    gap: 0.7rem;
    padding: 0.55rem 0 0.8rem;
  }

  .sidebar-presenter__thumb-item.is-section {
    display: flex;
    width: 132px;
    min-width: 132px;
    align-items: stretch;
  }

  .sidebar-presenter__section {
    height: auto;
    align-items: flex-start;
    padding: 0.85rem 0.75rem 0.45rem 0.2rem;
  }

  .sidebar-presenter__section-title {
    white-space: normal;
  }

  .sidebar-presenter__thumb {
    width: 158px;
    min-width: 158px;
    height: auto;
    padding: 0.45rem 0.3rem 0.35rem 0.75rem;
  }

  .sidebar-presenter__thumb::before {
    top: 0.45rem;
    bottom: 0.35rem;
    left: 0;
  }

  .sidebar-presenter__main {
    height: auto;
    padding: 0.65rem 0.75rem 0;
  }

  .sidebar-presenter__canvas-wrap {
    margin-top: 0;
  }

  .sidebar-presenter__notes {
    height: min(var(--sidebar-notes-height, 7rem), 18vh);
    margin-top: 0.55rem;
  }
}

@media (max-width: 640px) {
  .sidebar-presenter {
    grid-template-rows: 190px minmax(0, 1fr);
  }

  .sidebar-presenter__rail-head {
    min-height: 2rem;
  }

  .sidebar-presenter__thumbs {
    padding: 0 0.7rem;
  }

  .sidebar-presenter__main {
    padding: 0.5rem 0.5rem 0;
  }

  .sidebar-presenter__zoom {
    grid-template-columns: 1.7rem 2.8rem 1.7rem;
    height: 1.8rem;
  }

  .sidebar-presenter__canvas-bounds {
    inset: 2.15rem 0.3rem 0.3rem;
  }
}

@media (max-height: 700px) and (min-width: 961px) {
  .sidebar-presenter__main {
    padding-top: 0.5rem;
  }

  .sidebar-presenter__notes {
    margin-top: 0.45rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-presenter *,
  .sidebar-presenter *::before,
  .sidebar-presenter *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
