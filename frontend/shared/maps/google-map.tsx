'use client';

import { AdvancedMarker, InfoWindow, Map as GMap, Pin, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import { DEFAULT_CENTER, GOOGLE_MAP_ID, type MapPoint, type MapProps } from './config';

function FitBounds({
  points,
  origin,
}: {
  points: MapPoint[];
  origin?: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const all = [...points, ...(origin ? [origin] : [])];
    if (all.length === 1) {
      map.setCenter({ lat: all[0]!.lat, lng: all[0]!.lng });
      map.setZoom(15);
    } else if (all.length > 1) {
      const b = new google.maps.LatLngBounds();
      for (const p of all) b.extend({ lat: p.lat, lng: p.lng });
      map.fitBounds(b, 40);
    }
  }, [map, points, origin]);
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng });
    if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
  }, [map, lat, lng]);
  return null;
}

/** Google Maps version of the shared map (same props as the Leaflet one). Must be inside <APIProvider>. */
export default function GoogleMap({
  points = [],
  center = DEFAULT_CENTER,
  pick,
  onPick,
  activeId,
  origin,
  className = 'h-80',
}: MapProps) {
  const [open, setOpen] = useState<MapPoint | null>(null);

  return (
    <div className={`overflow-hidden rounded-lg border ${className}`}>
      <GMap
        mapId={GOOGLE_MAP_ID}
        defaultCenter={center}
        defaultZoom={12}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        clickableIcons={false}
        className="h-full w-full"
        onClick={(e) => {
          if (onPick && e.detail.latLng) onPick(e.detail.latLng.lat, e.detail.latLng.lng);
          setOpen(null);
        }}
      >
        {!onPick && <FitBounds points={points} origin={origin} />}

        {origin && (
          <AdvancedMarker position={origin} title="Searched place" zIndex={1}>
            <div className="size-4 rounded-full border-2 border-white bg-blue-600 shadow" />
          </AdvancedMarker>
        )}

        {points.map((p) => (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.label}
            onClick={() => setOpen(p)}
            zIndex={p.id === activeId ? 10 : 2}
          >
            <Pin
              background={p.id === activeId ? '#dc2626' : '#111827'}
              borderColor="#ffffff"
              glyphColor="#ffffff"
              scale={p.id === activeId ? 1.25 : 1}
            />
          </AdvancedMarker>
        ))}

        {open && (
          <InfoWindow
            position={{ lat: open.lat, lng: open.lng }}
            pixelOffset={[0, -36]}
            onCloseClick={() => setOpen(null)}
            headerDisabled
          >
            <div className="grid gap-0.5 text-sm text-neutral-900">
              {open.href ? (
                <a href={open.href} className="font-semibold underline">
                  {open.label}
                </a>
              ) : (
                <span className="font-semibold">{open.label}</span>
              )}
              {open.sub && <span className="text-neutral-600">{open.sub}</span>}
            </div>
          </InfoWindow>
        )}

        {onPick && pick && (
          <>
            <Recenter lat={pick.lat} lng={pick.lng} />
            <AdvancedMarker
              position={pick}
              draggable
              title="Drag to the entrance"
              onDragEnd={(e) => {
                const ll = e.latLng;
                if (ll) onPick(ll.lat(), ll.lng());
              }}
            >
              <Pin background="#dc2626" borderColor="#ffffff" glyphColor="#ffffff" scale={1.2} />
            </AdvancedMarker>
          </>
        )}
      </GMap>
    </div>
  );
}
