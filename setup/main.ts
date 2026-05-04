import { defineAppSetup } from '@slidev/types'

const GOTO_FIX_STYLE_ID = 'slidev-pane-goto-visibility-fix'
const GOTO_FIX_CSS = `
#slidev-goto-dialog[class*="-top-20"] .autocomplete-list {
  display: none !important;
}
`

export default defineAppSetup(() => {
  if (typeof document === 'undefined')
    return

  if (document.getElementById(GOTO_FIX_STYLE_ID))
    return

  const style = document.createElement('style')
  style.id = GOTO_FIX_STYLE_ID
  style.textContent = GOTO_FIX_CSS
  document.head.appendChild(style)
})
