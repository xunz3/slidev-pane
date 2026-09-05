import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, watch } from 'vue'

/** Keep keyboard focus in presenter dialogs and restore their launcher on close. */
export function usePaneDialog(
  open: Ref<boolean>,
  container: Ref<HTMLElement | undefined>,
  initialFocus?: Ref<HTMLElement | undefined>,
) {
  let previousFocus: HTMLElement | null = null

  function onKeydown(event: KeyboardEvent) {
    if (!open.value || !container.value) return

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      open.value = false
    } else if (event.key === 'Tab') {
      const items = Array.from(
        container.value.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
        ),
      ).filter((item) => item.tabIndex >= 0 && item.getClientRects().length > 0 && !item.closest('[inert]'))
      const first = items[0]
      const last = items.at(-1)
      if (!first) {
        event.preventDefault()
        container.value.focus()
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === container.value ||
          !container.value.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  watch(
    open,
    async (visible) => {
      if (typeof document === 'undefined') return

      if (visible) {
        previousFocus = document.activeElement as HTMLElement | null
        await nextTick()
        if (!open.value) return
        const target = initialFocus?.value || container.value
        target?.focus()
        document.addEventListener('keydown', onKeydown, true)
      } else {
        document.removeEventListener('keydown', onKeydown, true)
        await nextTick()
        if (!open.value && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
}
