/**
 * The single "write text to the clipboard" primitive for the app.
 *
 * There were four implementations of this before Plan 041 consolidation, and
 * the duplication propagated a bug rather than merely repeating code: two of
 * them wrote to the clipboard and reported success without ever checking
 * whether the write landed, so "Copied" rendered for a clipboard that had
 * silently refused. `pij-rail-view.tsx` had independently arrived at the
 * correct rule and written it down:
 *
 *   > A failure must therefore be VISIBLE: silently rendering "copied" for a
 *   > clipboard that never received the text is the one outcome worth
 *   > engineering against.
 *
 * THE CONTRACT: `copyText` resolves `true` only when the text actually
 * reached the clipboard. Callers MUST gate their success feedback on the
 * result. A caller that ignores it is reintroducing the defect.
 *
 * Why a failure is ordinary rather than exceptional here: `navigator.clipboard`
 * is absent on insecure origins (this app is routinely read on a LAN address
 * and from an iPad) and in jsdom, and `writeText` rejects when the document
 * is not focused or the permission is denied. All three are real in this
 * codebase, which is why the return value is a boolean and not a throw.
 */

/**
 * Pre-Clipboard-API fallback for non-secure origins (LAN HTTP, untrusted certs).
 *
 * The `setTimeout(0)` is load-bearing: appending and selecting the textarea
 * inside the originating event handler fights React's own focus handling, so
 * the copy is deferred by a tick. That tick is exactly why the pre-consolidation
 * code could not report a result — the caller had already returned. Resolving
 * from inside the timeout is what makes the outcome observable.
 *
 * `execCommand` returns false rather than throwing when the copy is refused,
 * so both the return value and a throw have to be treated as failure.
 */
function legacyCopy(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(textarea);
      }
      resolve(copied);
    }, 0);
  });
}

/**
 * Write `text` to the clipboard. Resolves whether it actually landed.
 *
 * A rejected `writeText` in a secure context falls through to the legacy path
 * rather than reporting failure immediately: a secure context is necessary but
 * not sufficient, and the older path can still service a denied permission or
 * an unfocused document.
 */
export async function copyText(text: string): Promise<boolean> {
  if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through — see doc comment
    }
  }
  return legacyCopy(text);
}
