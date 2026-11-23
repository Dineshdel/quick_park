/**
 * Google Maps is used when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (Maps JavaScript API + Places API (New)).
 * Without a key the app falls back to OpenStreetMap (Leaflet + Photon place search) so local dev still works.
 */
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
/** Advanced markers need a Map ID; Google's DEMO_MAP_ID works for development. */
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID';
export const DEFAULT_CENTER = { lat: 13.0827, lng: 80.2707 }; // Chennai

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** Second line in the pop-up, e.g. price or address. */
  sub?: string;
  href?: string;
}

export interface MapProps {
  points?: MapPoint[];
  center?: { lat: number; lng: number };
  /** Picker mode: one draggable pin at `pick`. */
  pick?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  /** Highlighted point (e.g. the result under the mouse). */
  activeId?: string | null;
  /** Where the user searched from, drawn as a blue dot. */
  origin?: { lat: number; lng: number } | null;
  className?: string;
}
