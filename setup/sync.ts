import type { RouteLocationRaw, Router } from 'vue-router'
import {
  getSidebarPresenterPath,
  isSidebarPresenterRouteName,
} from '../composables/useSidebarPresenterNav'

const ROUTER_PATCH_MARK = '__slidevPaneSyncRouteRewrite__'

type PatchedRouter = Router & {
  [ROUTER_PATCH_MARK]?: true
}

/**
 * Keep Slidev's native presenter/viewer sync inside the pane route.
 *
 * Slidev treats addon routes as viewers, which is the role we want, but its
 * shared-state receiver always replaces a viewer URL with `/:no`. Rewriting
 * only those replace navigations lets Slidev continue to own the sync state,
 * direction preferences, and transport without ejecting this view to `play`.
 * Regular push navigations (including leaving pane view) are untouched.
 */
export function installSidebarPresenterSyncRouteBridge(router: Router) {
  const patchedRouter = router as PatchedRouter
  if (patchedRouter[ROUTER_PATCH_MARK])
    return

  const replace = router.replace.bind(router)

  router.replace = ((to: RouteLocationRaw) => {
    const rewritten = getSidebarSyncReplaceTarget(router, to)
    return replace(rewritten ?? to)
  }) as Router['replace']

  patchedRouter[ROUTER_PATCH_MARK] = true
}

function getSidebarSyncReplaceTarget(
  router: Router,
  to: RouteLocationRaw,
): RouteLocationRaw | undefined {
  const currentRoute = router.currentRoute.value
  if (!isSidebarPresenterRouteName(currentRoute.name))
    return

  let target: ReturnType<Router['resolve']>
  try {
    target = router.resolve(to)
  }
  catch {
    return
  }

  // Slidev's shared-state receiver maps viewer updates to the built-in play
  // route. Other replace navigations should retain their original semantics.
  if (target.name !== 'play')
    return

  const no = Array.isArray(target.params.no)
    ? target.params.no.at(-1)
    : target.params.no
  if (no == null)
    return

  let path: string
  try {
    path = getSidebarPresenterPath(no)
  }
  catch {
    return
  }

  if (typeof to === 'string') {
    return {
      hash: target.hash,
      path,
      query: target.query,
    }
  }

  const { name: _name, params: _params, ...location } = to
  return {
    ...location,
    path,
  }
}
