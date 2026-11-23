/** Shared by the server (root layout) and the browser (ThemeProvider). */
export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'qp_theme';
export const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'light' || v === 'dark' || v === 'system';

/**
 * Runs in <head> before the page paints, so there is no flash of the wrong mode.
 * "system" follows the device setting (prefers-color-scheme).
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var c=m?m[1]:'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
