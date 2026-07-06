import { defineRoutesSetup } from '@slidev/types'
import { SIDEBAR_PRESENTER_PATH, SIDEBAR_PRESENTER_ROUTE_NAME } from '../composables/useSidebarPresenterNav'

export default defineRoutesSetup((routes) => {
  if (routes.some(route => route.name === SIDEBAR_PRESENTER_ROUTE_NAME))
    return routes

  const presenterRoute = routes.find(route => route.name === 'presenter')

  routes.unshift(
    {
      name: SIDEBAR_PRESENTER_ROUTE_NAME,
      path: `${SIDEBAR_PRESENTER_PATH}/:no`,
      component: () => import('../pages/SidebarPreviewPresenter.vue'),
      beforeEnter: presenterRoute?.beforeEnter,
    },
    {
      path: SIDEBAR_PRESENTER_PATH,
      redirect: { path: `${SIDEBAR_PRESENTER_PATH}/1` },
    },
  )

  return routes
})
