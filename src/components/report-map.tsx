"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface Report {
  id: number;
  type: "electricity" | "telecom";
  operator: string | null;
  description: string | null;
  street: string | null;
  lat: number;
  lng: number;
  upvotes: number;
  createdAt: string;
}

interface ReportMapProps {
  reports: Report[];
  onMapClick: (lat: number, lng: number) => void;
  onUpvote: (id: number) => void;
  onResolve: (id: number) => void;
}

const LEIRIA_CENTER: [number, number] = [39.74, -8.81];

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function getColor(type: string, operator: string | null): string {
  if (type === "electricity") return "#f59e0b";
  // telecom by operator
  switch (operator) {
    case "MEO": return "#00a3e0";
    case "NOS": return "#ff6600";
    case "Vodafone": return "#e60000";
    case "DIGI": return "#003087";
    default: return "#8b5cf6";
  }
}

function getLabel(type: string, operator: string | null): string {
  if (type === "electricity") return "Sem luz";
  return operator ? `Sem rede ${operator}` : "Sem rede";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function ReportMap({ reports, onMapClick, onUpvote, onResolve }: ReportMapProps) {
  return (
    <MapContainer
      center={LEIRIA_CENTER}
      zoom={13}
      className="h-[500px] w-full rounded-lg"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <ClickHandler onClick={onMapClick} />

      {reports.map((r) => {
        const color = getColor(r.type, r.operator);
        const label = getLabel(r.type, r.operator);
        const radius = Math.min(6 + r.upvotes * 1.5, 18);

        return (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.45,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{
                    display: "inline-block",
                    width: 10, height: 10, borderRadius: "50%",
                    background: color,
                  }} />
                  <strong style={{ fontSize: "14px" }}>{label}</strong>
                </div>

                {r.street && (
                  <p style={{ margin: "2px 0", fontSize: "12px", color: "#64748b" }}>
                    {r.street}
                  </p>
                )}

                {r.description && (
                  <p style={{ margin: "4px 0" }}>{r.description}</p>
                )}

                <p style={{ margin: "6px 0 2px", fontSize: "11px", color: "#94a3b8" }}>
                  {timeAgo(r.createdAt)} · {r.upvotes} confirmação{r.upvotes !== 1 ? "ões" : ""}
                </p>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpvote(r.id); }}
                    style={{
                      padding: "4px 10px", fontSize: "12px", borderRadius: 6,
                      border: "1px solid #334e68", background: "#1e3a5f", color: "#93c5fd",
                      cursor: "pointer",
                    }}
                  >
                    +1 Confirmo
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onResolve(r.id); }}
                    style={{
                      padding: "4px 10px", fontSize: "12px", borderRadius: 6,
                      border: "1px solid #334e68", background: "#1a332e", color: "#6ee7b7",
                      cursor: "pointer",
                    }}
                  >
                    Resolvido
                  </button>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
