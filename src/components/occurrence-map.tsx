"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Occurrence {
  id: number;
  nature: string | null;
  state: string | null;
  municipality: string | null;
  coordinates: { lat: number; lng: number } | null;
  startTime: string | null;
  numMeans: number | null;
  numOperatives: number | null;
}

interface OccurrenceMapProps {
  occurrences: Occurrence[];
}

const LEIRIA_CENTER: [number, number] = [39.75, -8.8];

export function OccurrenceMap({ occurrences }: OccurrenceMapProps) {
  const markers = occurrences.filter((o) => o.coordinates != null);

  return (
    <MapContainer
      center={LEIRIA_CENTER}
      zoom={10}
      className="h-[400px] w-full rounded-lg"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {markers.map((o) => (
        <Marker
          key={o.id}
          position={[o.coordinates!.lat, o.coordinates!.lng]}
          icon={defaultIcon}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{o.nature ?? "Ocorrência"}</p>
              <p className="text-gray-600">{o.municipality}</p>
              {o.state && <p>Estado: {o.state}</p>}
              {o.numMeans != null && <p>Meios: {o.numMeans}</p>}
              {o.numOperatives != null && (
                <p>Operacionais: {o.numOperatives}</p>
              )}
              {o.startTime && (
                <p className="text-xs text-gray-500">
                  Início: {new Date(o.startTime).toLocaleString("pt-PT")}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
