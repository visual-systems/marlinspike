/**
 * Debug logging utility.
 *
 * Enable from the browser console:
 *   window.__DEBUG__ = true
 *
 * Disable:
 *   window.__DEBUG__ = false
 */
// Default to enabled during development — toggle from console:
//   window.__DEBUG__ = false
(globalThis as Record<string, unknown>).__DEBUG__ ??= true;

export function dbg(...args: unknown[]): void {
  if ((globalThis as Record<string, unknown>).__DEBUG__) {
    console.log("[DBG]", ...args);
  }
}
