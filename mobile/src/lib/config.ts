import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Backend base URL (…/api/v1 is added by the API client).
 *  1. EXPO_PUBLIC_API_URL when set (production builds, or a fixed LAN address).
 *  2. In development: the computer running `expo start` (its LAN IP is in hostUri), port 4000.
 *  3. Fallback: Android emulator → 10.0.2.2 (the host machine), iOS simulator → localhost.
 */
function resolveApiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();
export const API_BASE = `${API_URL}/api/v1`;

/** Photos and files come back as "/api/v1/files/…": make them absolute for <Image>. */
export const fileUrl = (url: string | null | undefined) =>
  !url
    ? undefined
    : /^https?:\/\//.test(url)
      ? url
      : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;

/** The website, for screens kept on the web (owner setup, admin). */
export const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL?.trim() || API_URL.replace(/:4000$/, ':3000');
