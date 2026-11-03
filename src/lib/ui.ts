/**
 * Small shared helpers used across UI modules. All browser-only, all local.
 */

/** Copy text to the clipboard, returning success. Never throws. */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Strip zero-width characters that can interfere with selection on mobile.
  const cleanText = text.replace(/\u200B|\u200C/g, '');

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(cleanText);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    // Use clean text so that zero‑width chars do not break selection on mobile.
    ta.value = cleanText;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.userSelect = 'all';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Format a ratio (0..1) as a percentage string. */
export function pct(ratio: number, digits = 1): string {
  return (ratio * 100).toFixed(digits) + '%';
}

/** Join non-empty class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
