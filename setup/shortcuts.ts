import { useNav } from '@slidev/client'
import { currentOverviewPage } from '@slidev/client/logic/overview.ts'
import { showOverview } from '@slidev/client/state/index.ts'
import { defineShortcutsSetup } from '@slidev/types'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'

export default defineShortcutsSetup((_nav, shortcuts) => {
  const { next, prev, nextSlide, prevSlide } = useNav()
  const {
    enterSidebarPresenter,
    exitSidebarPresenter,
    goSidebar,
    isSidebarPresenter,
    nextSidebar,
    nextSlideSidebar,
    prevSidebar,
    prevSlideSidebar,
  } = useSidebarPresenterNav()

  const navigationOverrides = {
    next_space: () => isSidebarPresenter.value ? nextSidebar() : next(),
    prev_space: () => isSidebarPresenter.value ? prevSidebar() : prev(),
    next_right: () => isSidebarPresenter.value ? nextSidebar() : next(),
    prev_left: () => isSidebarPresenter.value ? prevSidebar() : prev(),
    next_page_key: () => isSidebarPresenter.value ? nextSidebar() : next(),
    prev_page_key: () => isSidebarPresenter.value ? prevSidebar() : prev(),
    next_down: () => isSidebarPresenter.value ? nextSlideSidebar() : nextSlide(),
    prev_up: () => isSidebarPresenter.value ? prevSlideSidebar() : prevSlide(),
    next_shift: () => isSidebarPresenter.value ? nextSlideSidebar() : nextSlide(),
    prev_shift: () => isSidebarPresenter.value ? prevSlideSidebar() : prevSlide(),
    goto_from_overview: (fallback?: () => void) => {
      if (!isSidebarPresenter.value) {
        fallback?.()
        return
      }
      goSidebar(currentOverviewPage.value)
      showOverview.value = false
    },
  } as const

  return [
    ...shortcuts.map((shortcut) => {
      const override = shortcut.name && navigationOverrides[shortcut.name as keyof typeof navigationOverrides]
      if (!override)
        return shortcut

      return {
        ...shortcut,
        fn: () => override(shortcut.fn),
      }
    }),
    {
      name: 'toggle_pane_presenter',
      key: 'p',
      fn: () => {
        if (isSidebarPresenter.value)
          exitSidebarPresenter()
        else
          enterSidebarPresenter()
      },
    },
  ]
})
