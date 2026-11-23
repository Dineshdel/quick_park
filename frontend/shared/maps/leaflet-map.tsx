'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { DEFAULT_CENTER, type MapPoint, type MapProps } from './config';

/** CSS pin (avoids Leaflet's default image icons, which break under bundlers). */
const pin = (active = false) =>
  L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${active ? '#dc2626' : '#111'};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });

function FitBounds({ points, origin }: { points: MapPoint[]; origin?: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const all = [...points, ...(origin ? [origin] : [])];
    if (all.length === 1) map.setView([all[0]!.lat, all[0]!.lng], 15);
    else if (all.length > 1) map.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
  }, [points, origin, map]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, map]);
  return null;
}

export default function LeafletMap({ points = [], center = DEFAULT_CENTER, pick, onPick, activeId, origin, className = 'h-80' }: MapProps) {
  return (
    <div className={`overflow-hidden rounded-lg border ${className}`}>
      <MapContainer center={[center.lat, center.lng]} zoom={12} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {!onPick && <FitBounds points={points} origin={origin} />}
        {origin && <CircleMarker center={[origin.lat, origin.lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} />}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pin(p.id === activeId)} zIndexOffset={p.id === activeId ? 1000 : 0}>
            {p.label && (
              <Popup>
                {p.href ? (
                  <a href={p.href} className="font-medium underline">
                    {p.label}
                  </a>
                ) : (
                  p.label
                )}
                {p.sub && <div>{p.sub}</div>}
              </Popup>
            )}
          </Marker>
        ))}
        {onPick && <ClickToPick onPick={onPick} />}
        {onPick && pick && (
          <>
            <Recenter lat={pick.lat} lng={pick.lng} />
            <Marker
              position={[pick.lat, pick.lng]}
              icon={pin(true)}
              draggable
              eventHandlers={{ dragend: (e) => onPick((e.target as L.Marker).getLatLng().lat, (e.target as L.Marker).getLatLng().lng) }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
