'use client';

import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { useCallback, useRef } from 'react';
import { GOOGLE_MAPS_KEY } from './config';

/** A place suggestion (area, landmark, street…) from Google Places or, without a key, Photon/OpenStreetMap. */
export interface PlaceSuggestion {
  id: string;
  title: string;
  subtitle: string;
  /** Opaque handle used by `resolve`. */
  ref: unknown;
}

export interface ResolvedPlace {
  lat: number;
  lng: number;
  label: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

// ---------- OpenStreetMap fallback (Photon by komoot: free, no key) ----------
interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id: number;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}
const INDIA_BBOX = '68.1,6.5,97.4,35.7';

async function photonSuggest(input: string): Promise<PlaceSuggestion[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(input)}&limit=5&lang=en&bbox=${INDIA_BBOX}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { features: PhotonFeature[] };
  return data.features.map((f, i) => {
    const p = f.properties;
    const title =
      p.name ?? ([p.housenumber, p.street].filter(Boolean).join(' ') || p.city || input);
    const subtitle = [p.locality ?? p.district, p.city ?? p.county, p.state]
      .filter((x) => x && x !== title)
      .join(', ');
    return { id: `osm-${p.osm_id}-${i}`, title, subtitle, ref: f };
  });
}

function photonResolve(s: PlaceSuggestion): ResolvedPlace {
  const f = s.ref as PhotonFeature;
  const p = f.properties;
  return {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    label: s.title,
    address: [p.name, [p.housenumber, p.street].filter(Boolean).join(' '), p.locality ?? p.district]
      .filter(Boolean)
      .join(', '),
    city: p.city ?? p.county ?? '',
    state: p.state ?? '',
    pincode: p.postcode ?? '',
  };
}

// ---------- Google Places (New) ----------
function component(place: google.maps.places.Place, type: string) {
  return place.addressComponents?.find((c) => c.types.includes(type))?.longText ?? '';
}

/**
 * Place autocomplete. Uses Google Places when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (results biased to India),
 * otherwise Photon. The Google path must render inside <APIProvider> (see shared/providers.tsx).
 */
export function usePlaceSearch() {
  const places = useMapsLibrary('places'); // null (never loads) without an APIProvider
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const suggest = useCallback(
    async (input: string): Promise<PlaceSuggestion[]> => {
      if (input.trim().length < 3) return [];
      if (!GOOGLE_MAPS_KEY) return photonSuggest(input).catch(() => []);
      if (!places) return [];
      token.current ??= new places.AutocompleteSessionToken();
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token.current,
        includedRegionCodes: ['in'],
      });
      return suggestions
        .filter((s) => s.placePrediction)
        .slice(0, 5)
        .map((s) => {
          const p = s.placePrediction!;
          return {
            id: p.placeId,
            title: p.mainText?.text ?? p.text.text,
            subtitle: p.secondaryText?.text ?? '',
            ref: p,
          };
        });
    },
    [places],
  );

  const resolve = useCallback(async (s: PlaceSuggestion): Promise<ResolvedPlace> => {
    if (!GOOGLE_MAPS_KEY) return photonResolve(s);
    const place = (s.ref as google.maps.places.PlacePrediction).toPlace();
    await place.fetchFields({
      fields: ['location', 'displayName', 'formattedAddress', 'addressComponents'],
    });
    token.current = null; // the session ends with fetchFields
    return {
      lat: place.location!.lat(),
      lng: place.location!.lng(),
      label: place.displayName ?? s.title,
      address: place.formattedAddress ?? s.title,
      city:
        component(place, 'locality') ||
        component(place, 'administrative_area_level_3') ||
        component(place, 'administrative_area_level_2'),
      state: component(place, 'administrative_area_level_1'),
      pincode: component(place, 'postal_code'),
    };
  }, []);

  return { suggest, resolve, provider: GOOGLE_MAPS_KEY ? ('google' as const) : ('osm' as const) };
}
