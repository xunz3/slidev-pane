import { computed, ref } from 'vue'

export const SIDEBAR_PRESENTER_DEFAULT_ZOOM = 1
export const SIDEBAR_PRESENTER_MIN_ZOOM = 0.5
export const SIDEBAR_PRESENTER_MAX_ZOOM = 2.5
export const SIDEBAR_PRESENTER_ZOOM_STEP = 0.1

const ZOOM_STORAGE_KEY = 'slidev-pane:presenter-zoom'
const WHEEL_ZOOM_SENSITIVITY = 0.0015

const slideZoom = ref(SIDEBAR_PRESENTER_DEFAULT_ZOOM)

let restored = false

function clampBetween(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeSlideZoom(value: number) {
  return Math.round(clampBetween(value, SIDEBAR_PRESENTER_MIN_ZOOM, SIDEBAR_PRESENTER_MAX_ZOOM) * 100) / 100
}

function persistSlideZoom(value: number) {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, value.toString())
  }
  catch {
    // Ignore storage failures and keep the zoom in memory.
  }
}

function restoreSlideZoom() {
  if (restored || typeof window === 'undefined')
    return

  restored = true

  try {
    const storedZoom = Number.parseFloat(window.localStorage.getItem(ZOOM_STORAGE_KEY) || '')
    if (Number.isFinite(storedZoom))
      slideZoom.value = normalizeSlideZoom(storedZoom)
  }
  catch {
    slideZoom.value = SIDEBAR_PRESENTER_DEFAULT_ZOOM
  }
}

function setSlideZoom(value: number) {
  restoreSlideZoom()

  const nextZoom = normalizeSlideZoom(value)
  slideZoom.value = nextZoom
  persistSlideZoom(nextZoom)
  return nextZoom
}

function resetSlideZoom() {
  return setSlideZoom(SIDEBAR_PRESENTER_DEFAULT_ZOOM)
}

function getWheelZoomTarget(deltaY: number) {
  restoreSlideZoom()
  return normalizeSlideZoom(slideZoom.value * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY))
}

export function useSidebarPresenterZoom() {
  restoreSlideZoom()

  const zoomPercentage = computed(() => `${Math.round(slideZoom.value * 100)}%`)
  const canZoomIn = computed(() => slideZoom.value < SIDEBAR_PRESENTER_MAX_ZOOM)
  const canZoomOut = computed(() => slideZoom.value > SIDEBAR_PRESENTER_MIN_ZOOM)

  return {
    canZoomIn,
    canZoomOut,
    getWheelZoomTarget,
    resetSlideZoom,
    setSlideZoom,
    slideZoom,
    zoomPercentage,
  }
}
