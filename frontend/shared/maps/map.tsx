'use client';

import dynamic from 'next/dynamic';
import { GOOGLE_MAPS_KEY } from './config';

const loading = () => <div className="h-80 animate-pulse rounded-lg border bg-muted" />;

/** Google Maps when a key is configured, otherwise Leaflet/OpenStreetMap. Both touch `window`, so browser-only. */
export const Map = GOOGLE_MAPS_KEY
  ? dynamic(() => import('./google-map'), { ssr: false, loading })
  : dynamic(() => import('./leaflet-map'), { ssr: false, loading });
export type { MapPoint, MapProps } from './config';
