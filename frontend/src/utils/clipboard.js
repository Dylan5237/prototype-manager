/**
 * Copy text from a user-initiated action in both secure and intranet HTTP pages.
 * Clipboard API is preferred; the textarea path covers browsers that reject it.
 */
export async function copyText(text) {
  const value = String(text ?? '')
  if (!value.trim()) throw new Error('empty clipboard text')

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch (error) {
      // Fall through for HTTP pages or browsers that deny clipboard permission.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  Object.assign(textarea.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    opacity: '0',
    pointerEvents: 'none'
  })
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
  if (!copied) throw new Error('clipboard unavailable')
}
