import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { pathPrefix } from '@slidev/client/env.ts'
import { getSlide, getSlidePath, slides } from '@slidev/client/logic/slides.ts'
import { computed, getCurrentInstance } from 'vue'

export const SIDEBAR_PRESENTER_ROUTE_NAME = 'pane-view'
export const SIDEBAR_PRESENTER_PATH = '/pane-view'

type QueryValue = string | string[] | null | undefined
type QueryRecord = Record<string, QueryValue>
type RouteLike = {
  name?: unknown
  path?: string
  params?: Record<string, unknown>
  query?: QueryRecord
}
type RouterLike = {
  currentRoute?: { value?: RouteLike }
  push?: (to: { path: string, query?: QueryRecord }) => Promise<unknown> | unknown
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function isSidebarPresenterRouteName(name: unknown) {
  return name === SIDEBAR_PRESENTER_ROUTE_NAME
}

export function getSidebarPresenterPath(no: number | string) {
  const route = getSlide(no)!
  const slideNo = route.meta.slide?.frontmatter.routeAlias ?? route.no
  return `${SIDEBAR_PRESENTER_PATH}/${slideNo}`
}

export function useSidebarPresenterNav() {
  const nav = useNav()
  const instance = getCurrentInstance()

  const isSidebarPresenter = computed(() => {
    const route = getCurrentRoute()
    return isSidebarPresenterRouteName(route?.name) || isSidebarPresenterPath(getCurrentPath())
  })

  function getSidebarQuery(clicks?: number) {
    const query = {
      ...getCurrentQuery(),
    }

    if (clicks === undefined || clicks === 0)
      delete query.clicks
    else
      query.clicks = clicks.toString()

    if (hasQueryValue(query.embedded))
      query.embedded = 'true'
    else
      delete query.embedded

    return {
      ...query,
    }
  }

  async function pushRoute(path: string, query?: QueryRecord) {
    const router = getRouter()
    if (router?.push) {
      try {
        return await router.push({ path, query })
      }
      catch {
        // Fall back to a hard navigation when the addon is using a different
        // vue-router instance than the host Slidev app.
      }
    }

    if (typeof window === 'undefined')
      return

    const href = createRouteHref(path, query)
    const currentHref = new URL(window.location.href).href
    const targetHref = new URL(href, window.location.href).href
    if (currentHref !== targetHref)
      window.location.assign(href)
  }

  function pushSidebarRoute(no: number | string, clicks?: number) {
    return pushRoute(getSidebarPresenterPath(no), getSidebarQuery(clicks))
  }

  async function goSidebar(no: number | string, clicks = 0, force = false) {
    const targetRoute = getSlide(no)
    if (!targetRoute)
      return

    const clicksStart = targetRoute.meta.slide?.frontmatter.clicksStart ?? 0
    const clicksTotal = getRouteClicksTotal(targetRoute)
    const nextClicks = clampNumber(clicks, clicksStart, clicksTotal || CLICKS_MAX)
    const pageChanged = getCurrentSlideNo() !== targetRoute.no
    const clicksChanged = nextClicks !== getCurrentClicks()

    if (!force && !pageChanged && !clicksChanged)
      return

    await pushSidebarRoute(targetRoute.no, nextClicks)
  }

  async function nextSidebar() {
    const currentSlideNo = getCurrentSlideNo()
    const clicks = getCurrentClicks()

    if (clicks < getCurrentClicksTotal())
      await goSidebar(currentSlideNo, clicks + 1)
    else if (currentSlideNo < getTotal())
      await goSidebar(currentSlideNo + 1)
  }

  async function prevSidebar() {
    const currentSlideNo = getCurrentSlideNo()
    const clicks = getCurrentClicks()

    if (clicks > getCurrentClicksStart())
      await goSidebar(currentSlideNo, clicks - 1)
    else if (currentSlideNo > 1)
      await goSidebar(currentSlideNo - 1, CLICKS_MAX)
  }

  async function nextSlideSidebar(lastClicks = false) {
    const currentSlideNo = getCurrentSlideNo()
    if (currentSlideNo < getTotal())
      await goSidebar(currentSlideNo + 1, lastClicks ? CLICKS_MAX : 0)
  }

  async function prevSlideSidebar(lastClicks = false) {
    const currentSlideNo = getCurrentSlideNo()
    if (currentSlideNo > 1)
      await goSidebar(currentSlideNo - 1, lastClicks ? CLICKS_MAX : 0)
  }

  function enterSidebarPresenter() {
    pushSidebarRoute(getCurrentSlideNo())
  }

  function enterClassicPresenter() {
    pushRoute(getSlidePath(getCurrentSlideNo(), true), getCurrentQuery())
  }

  function exitSidebarPresenter() {
    pushRoute(getSlidePath(getCurrentSlideNo(), false), getCurrentQuery())
  }

  function getRouter() {
    return (
      (nav as unknown as { router?: RouterLike }).router
      ?? (instance?.proxy as unknown as { $router?: RouterLike } | undefined)?.$router
      ?? (instance?.appContext.config.globalProperties as { $router?: RouterLike }).$router
    )
  }

  function getCurrentRoute(): RouteLike | undefined {
    return (
      safeValue((nav as unknown as { currentRoute?: { value?: RouteLike } }).currentRoute)
      ?? getRouter()?.currentRoute?.value
      ?? (instance?.proxy as unknown as { $route?: RouteLike } | undefined)?.$route
    )
  }

  function getCurrentQuery(): QueryRecord {
    return {
      ...parseLocationQuery(),
      ...(getCurrentRoute()?.query ?? {}),
    }
  }

  function getCurrentPath() {
    return getCurrentRoute()?.path ?? getLocationPath()
  }

  function getCurrentSlideNo() {
    return safeValue(nav.currentSlideNo) ?? getSlide(getCurrentSlideIdentifier())?.no ?? 1
  }

  function getCurrentSlideIdentifier() {
    const routeParam = getCurrentRoute()?.params?.no
    if (typeof routeParam === 'string' || typeof routeParam === 'number')
      return routeParam

    const parts = getCurrentPath().split('/').filter(Boolean)
    return parts.at(-1) ?? 1
  }

  function getCurrentClicks() {
    return safeValue(nav.clicks) ?? parseNumberQuery(getCurrentQuery().clicks) ?? 0
  }

  function getCurrentClicksStart() {
    return safeValue(nav.clicksStart) ?? getSlide(getCurrentSlideNo())?.meta.slide?.frontmatter.clicksStart ?? 0
  }

  function getCurrentClicksTotal() {
    return safeValue(nav.clicksTotal) ?? getRouteClicksTotal(getSlide(getCurrentSlideNo()))
  }

  function getTotal() {
    return safeValue(nav.total) ?? safeValue(slides)?.length ?? 1
  }

  function getRouteClicksTotal(route: ReturnType<typeof getSlide>) {
    if (!route)
      return CLICKS_MAX

    try {
      return nav.getPrimaryClicks(route).total
    }
    catch {
      return route.meta.__clicksContext?.total ?? CLICKS_MAX
    }
  }

  return {
    isSidebarPresenter,
    goSidebar,
    nextSidebar,
    prevSidebar,
    nextSlideSidebar,
    prevSlideSidebar,
    enterSidebarPresenter,
    enterClassicPresenter,
    exitSidebarPresenter,
  }
}

function safeValue<T>(source: { value: T } | undefined): T | undefined {
  try {
    return source?.value
  }
  catch {
    return undefined
  }
}

function isSidebarPresenterPath(path: string) {
  return path === SIDEBAR_PRESENTER_PATH || path.startsWith(`${SIDEBAR_PRESENTER_PATH}/`)
}

function hasQueryValue(value: QueryValue) {
  return Array.isArray(value) ? value.length > 0 : value != null
}

function parseNumberQuery(value: QueryValue) {
  const raw = Array.isArray(value) ? value.at(-1) : value
  if (raw == null)
    return undefined

  const number = Number.parseInt(raw, 10)
  return Number.isNaN(number) ? undefined : number
}

function parseLocationQuery(): QueryRecord {
  if (typeof location === 'undefined')
    return {}

  const query: QueryRecord = {}
  appendSearchParams(query, location.search)

  const hashQueryIndex = location.hash.indexOf('?')
  if (hashQueryIndex >= 0)
    appendSearchParams(query, location.hash.slice(hashQueryIndex + 1))

  return query
}

function appendSearchParams(query: QueryRecord, search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.forEach((value, key) => {
    const current = query[key]
    if (Array.isArray(current))
      current.push(value)
    else if (current != null)
      query[key] = [current, value]
    else
      query[key] = value
  })
}

function getLocationPath() {
  if (typeof location === 'undefined')
    return '/'

  if (location.hash.startsWith('#/'))
    return location.hash.slice(1).split('?')[0] || '/'

  const [base] = pathPrefix.split('#')
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  if (
    normalizedBase
    && normalizedBase !== '/'
    && (location.pathname === normalizedBase || location.pathname.startsWith(`${normalizedBase}/`))
  ) {
    return location.pathname.slice(normalizedBase.length) || '/'
  }

  return location.pathname
}

function createRouteHref(path: string, query?: QueryRecord) {
  const normalizedPrefix = pathPrefix.endsWith('/') ? pathPrefix : `${pathPrefix}/`
  return `${normalizedPrefix}${path.replace(/^\//, '')}${stringifyQuery(query)}`
}

function stringifyQuery(query: QueryRecord = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (item != null)
        params.append(key, item)
    }
  }

  const search = params.toString()
  return search ? `?${search}` : ''
}
