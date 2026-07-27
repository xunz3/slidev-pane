import { ref } from 'vue'

export const SIDEBAR_PRESENTER_DEFAULT_RAIL_WIDTH = 286
export const SIDEBAR_PRESENTER_MIN_RAIL_WIDTH = 236
export const SIDEBAR_PRESENTER_MAX_RAIL_WIDTH = 480
export const SIDEBAR_PRESENTER_MIN_NOTES_HEIGHT = 112
export const SIDEBAR_PRESENTER_MAX_NOTES_HEIGHT = 480

const LAYOUT_STORAGE_KEY = 'slidev-pane:presenter-layout'

const railWidth = ref(SIDEBAR_PRESENTER_DEFAULT_RAIL_WIDTH)
const notesHeight = ref(getDefaultNotesHeight())

let restored = false

function clampBetween(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getViewportWidth() {
  return typeof window === 'undefined' ? 1440 : window.innerWidth
}

function getViewportHeight() {
  return typeof window === 'undefined' ? 900 : window.innerHeight
}

export function getRailWidthMax() {
  return Math.max(
    SIDEBAR_PRESENTER_MIN_RAIL_WIDTH,
    Math.min(SIDEBAR_PRESENTER_MAX_RAIL_WIDTH, getViewportWidth() - 480),
  )
}

export function getNotesHeightMax() {
  return Math.max(
    SIDEBAR_PRESENTER_MIN_NOTES_HEIGHT,
    Math.min(SIDEBAR_PRESENTER_MAX_NOTES_HEIGHT, getViewportHeight() - 260),
  )
}

export function getDefaultNotesHeight() {
  return Math.round(clampBetween(getViewportHeight() * 0.22, 144, 240))
}

function normalizeRailWidth(value: number) {
  return Math.round(clampBetween(value, SIDEBAR_PRESENTER_MIN_RAIL_WIDTH, getRailWidthMax()))
}

function normalizeNotesHeight(value: number) {
  return Math.round(clampBetween(value, SIDEBAR_PRESENTER_MIN_NOTES_HEIGHT, getNotesHeightMax()))
}

function persistPresenterLayout() {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      notesHeight: notesHeight.value,
      railWidth: railWidth.value,
    }))
  }
  catch {
    // Keep the current layout in memory when storage is unavailable.
  }
}

function restorePresenterLayout() {
  if (restored || typeof window === 'undefined')
    return

  restored = true

  try {
    const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}') as {
      notesHeight?: unknown
      railWidth?: unknown
    }

    if (typeof stored.railWidth === 'number' && Number.isFinite(stored.railWidth))
      railWidth.value = normalizeRailWidth(stored.railWidth)

    if (typeof stored.notesHeight === 'number' && Number.isFinite(stored.notesHeight))
      notesHeight.value = normalizeNotesHeight(stored.notesHeight)
  }
  catch {
    railWidth.value = SIDEBAR_PRESENTER_DEFAULT_RAIL_WIDTH
    notesHeight.value = getDefaultNotesHeight()
  }
}

function setRailWidth(value: number, persist = true) {
  restorePresenterLayout()
  railWidth.value = normalizeRailWidth(value)
  if (persist)
    persistPresenterLayout()
  return railWidth.value
}

function setNotesHeight(value: number, persist = true) {
  restorePresenterLayout()
  notesHeight.value = normalizeNotesHeight(value)
  if (persist)
    persistPresenterLayout()
  return notesHeight.value
}

function resetRailWidth() {
  return setRailWidth(SIDEBAR_PRESENTER_DEFAULT_RAIL_WIDTH)
}

function resetNotesHeight() {
  return setNotesHeight(getDefaultNotesHeight())
}

function constrainPresenterLayout() {
  railWidth.value = normalizeRailWidth(railWidth.value)
  notesHeight.value = normalizeNotesHeight(notesHeight.value)
}

export function useSidebarPresenterLayout() {
  restorePresenterLayout()

  return {
    constrainPresenterLayout,
    notesHeight,
    persistPresenterLayout,
    railWidth,
    resetNotesHeight,
    resetRailWidth,
    setNotesHeight,
    setRailWidth,
  }
}
