import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { getSlide } from '@slidev/client/logic/slides.ts'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export const SIDEBAR_PRESENTER_ROUTE_NAME = 'pane-presenter'
export const SIDEBAR_PRESENTER_PATH = '/pane-presenter'

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
  const route = useRoute()
  const router = useRouter()

  const isSidebarPresenter = computed(() => isSidebarPresenterRouteName(route.name))

  function getSidebarQuery(clicks?: number) {
    return {
      ...router.currentRoute.value.query,
      clicks: clicks === undefined || clicks === 0 ? undefined : clicks.toString(),
      embedded: router.currentRoute.value.query.embedded ? 'true' : undefined,
    }
  }

  function pushSidebarRoute(no: number | string, clicks?: number) {
    return router.push({
      path: getSidebarPresenterPath(no),
      query: getSidebarQuery(clicks),
    })
  }

  async function goSidebar(no: number | string, clicks = 0, force = false) {
    const targetRoute = getSlide(no)
    if (!targetRoute)
      return

    const clicksStart = targetRoute.meta.slide?.frontmatter.clicksStart ?? 0
    const clicksTotal = nav.getPrimaryClicks(targetRoute).total
    const nextClicks = clampNumber(clicks, clicksStart, clicksTotal || CLICKS_MAX)
    const pageChanged = nav.currentSlideNo.value !== targetRoute.no
    const clicksChanged = nextClicks !== nav.clicks.value

    if (!force && !pageChanged && !clicksChanged)
      return

    await pushSidebarRoute(targetRoute.no, nextClicks)
  }

  async function nextSidebar() {
    if (nav.clicks.value < nav.clicksTotal.value)
      await goSidebar(nav.currentSlideNo.value, nav.clicks.value + 1)
    else if (nav.currentSlideNo.value < nav.total.value)
      await goSidebar(nav.currentSlideNo.value + 1)
  }

  async function prevSidebar() {
    if (nav.clicks.value > nav.clicksStart.value)
      await goSidebar(nav.currentSlideNo.value, nav.clicks.value - 1)
    else if (nav.currentSlideNo.value > 1)
      await goSidebar(nav.currentSlideNo.value - 1, CLICKS_MAX)
  }

  async function nextSlideSidebar(lastClicks = false) {
    if (nav.currentSlideNo.value < nav.total.value)
      await goSidebar(nav.currentSlideNo.value + 1, lastClicks ? CLICKS_MAX : 0)
  }

  async function prevSlideSidebar(lastClicks = false) {
    if (nav.currentSlideNo.value > 1)
      await goSidebar(nav.currentSlideNo.value - 1, lastClicks ? CLICKS_MAX : 0)
  }

  function enterSidebarPresenter() {
    pushSidebarRoute(nav.currentSlideNo.value)
  }

  function enterClassicPresenter() {
    nav.enterPresenter()
  }

  function exitSidebarPresenter() {
    nav.exitPresenter()
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
