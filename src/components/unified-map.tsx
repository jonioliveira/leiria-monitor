"use client";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

/* ── Shared types (local to map) ──────────────────────────── */

export interface MunicipalityData {
  name: string;
  lat: number;
  lng: number;
  outages: number;
  meo?: {
    rede_fixa_pct: number | null;
    rede_movel_pct: number | null;
    rede_fixa_previsao: string;
    rede_movel_previsao: string;
  } | null;
}

export interface Report {
  id: number;
  type: "electricity" | "telecom_mobile" | "telecom_fixed" | "water" | "roads";
  operator: string | null;
  description: string | null;
  street: string | null;
  parish?: string | null;
  lat: number;
  lng: number;
  upvotes: number;
  priority?: "urgente" | "importante" | "normal";
  lastUpvotedAt?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

export interface Hotspot {
  lat: number;
  lng: number;
  reportIds: number[];
  count: number;
}

export interface SubstationMarker {
  name: string;
  lat: number;
  lng: number;
  latestLoad: number | null;
}

export interface TransformerMarker {
  id: string;
  lat: number;
  lng: number;
  kva: number;
  usage: string;
  clients: number;
  municipality: string;
}

export interface AntennaFeature {
  id: number;
  lat: number;
  lng: number;
  operators: string[];
  owner: string | null;
  type: string;
  technologies: string[];
}

export interface Occurrence {
  id: number;
  nature: string | null;
  state: string | null;
  municipality: string | null;
  coordinates: { lat: number; lng: number } | null;
  startTime: string | null;
  numMeans: number | null;
  numOperatives: number | null;
}

export interface PoleMarker {
  id: number;
  lat: number;
  lng: number;
}

export interface InfraReportContext {
  lat: number;
  lng: number;
  label: string;
  type: "electricity" | "telecom_mobile" | "telecom_fixed" | "water" | "roads";
  operator: string | null;
  details: string[];
}

export interface UnifiedMapProps {
  layers: {
    outages?: MunicipalityData[];
    substations?: SubstationMarker[];
    transformers?: TransformerMarker[];
    antennas?: AntennaFeature[];
    occurrences?: Occurrence[];
    reports?: Report[];
    poles?: PoleMarker[];
    hotspots?: Hotspot[];
  };
  visibleLayers: Set<string>;
  visibleOperators?: Set<string>;
  onMapClick?: (lat: number, lng: number) => void;
  onReportInfra?: (ctx: InfraReportContext) => void;
  onUpvote?: (id: number) => void;
  onResolve?: (id: number) => void;
  onShare?: (id: number) => void;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  clickedPosition?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number } | null;
  flyTo?: { lat: number; lng: number; zoom: number } | null;
}

/* ── Constants ─────────────────────────────────────────────── */

const LEIRIA_CENTER: [number, number] = [39.65, -8.75];

const OPERATOR_COLORS: Record<string, string> = {
  MEO: "#00a3e0",
  NOS: "#ff6600",
  Vodafone: "#e60000",
  DIGI: "#003087",
};

const TECH_LABELS: Record<string, string> = {
  "2G": "Chamadas e SMS",
  "3G": "Internet básica",
  "4G": "Internet rápida",
  "5G": "Internet muito rápida",
  Móvel: "Rede móvel",
};

/* ── Helpers ───────────────────────────────────────────────── */

function getElectricityColor(outages: number): string {
  if (outages === 0) return "#10b981";
  if (outages <= 5) return "#f59e0b";
  if (outages <= 20) return "#f97316";
  return "#ef4444";
}

function getElectricityRadius(outages: number): number {
  if (outages === 0) return 8;
  if (outages <= 5) return 12;
  if (outages <= 20) return 16;
  if (outages <= 50) return 20;
  return 24;
}

function getTelecomColor(pct: number | null): string {
  if (pct == null) return "#64748b";
  if (pct >= 95) return "#10b981";
  if (pct >= 80) return "#f59e0b";
  if (pct >= 50) return "#f97316";
  return "#ef4444";
}

function getReportColor(type: string, operator: string | null): string {
  if (type === "electricity") return "#f59e0b";
  if (type === "roads") return "#f97316";
  if (type === "telecom_mobile") {
    switch (operator) {
      case "MEO": return "#00a3e0";
      case "NOS": return "#ff6600";
      case "Vodafone": return "#e60000";
      case "DIGI": return "#003087";
      default: return "#3b82f6";
    }
  }
  if (type === "telecom_fixed") {
    switch (operator) {
      case "MEO": return "#00a3e0";
      case "NOS": return "#ff6600";
      case "Vodafone": return "#e60000";
      case "DIGI": return "#003087";
      default: return "#6366f1";
    }
  }
  if (type === "water") return "#06b6d4";
  return "#8b5cf6";
}

function getReportLabel(type: string, operator: string | null): string {
  if (type === "electricity") return "Sem luz";
  if (type === "roads") return "Estrada cortada";
  if (type === "telecom_mobile") return `Sem rede móvel${operator ? ` ${operator}` : ""}`;
  if (type === "telecom_fixed") return `Sem rede fixa${operator ? ` ${operator}` : ""}`;
  if (type === "water") return "Sem água";
  return "Reporte";
}

function isStale(report: Report): boolean {
  const now = Date.now();
  const createdMs = new Date(report.createdAt).getTime();
  const ageMs = now - createdMs;
  if (ageMs < 48 * 60 * 60 * 1000) return false; // < 48h old

  if (!report.lastUpvotedAt) return true;
  const lastUpvoteMs = new Date(report.lastUpvotedAt).getTime();
  return now - lastUpvoteMs > 24 * 60 * 60 * 1000;
}

function getSubstationColor(load: number | null): string {
  if (load == null) return "#64748b";
  if (load > 5) return "#10b981";
  if (load > 0) return "#f59e0b";
  return "#ef4444";
}

function getPtdColor(usage: string): string {
  if (usage.includes("60") || usage.includes("80") || usage.includes("100"))
    return "#10b981";
  if (usage.includes("40")) return "#f59e0b";
  return "#64748b";
}

function createPtdIcon(usage: string): L.DivIcon {
  const color = getPtdColor(usage);
  return L.divIcon({
    html: `<div style="width:18px;height:18px;background:${color};border:2px solid white;box-shadow:0 0 5px rgba(0,0,0,0.35);transform:rotate(45deg);border-radius:2px"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function getAntennaMarkerColor(operators: string[]): string {
  if (operators.length > 1) return "#8b5cf6";
  return OPERATOR_COLORS[operators[0]] ?? "#64748b";
}

function createAntennaIcon(operators: string[]): L.DivIcon {
  const color = getAntennaMarkerColor(operators);
  return L.divIcon({
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg width="30" height="30" viewBox="0 0 22 22"><circle cx="11" cy="13" r="5" fill="${color}" stroke="white" stroke-width="2"/><path d="M6.5 8.5a6.5 6.5 0 0 1 9 0" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/><path d="M4 6a10 10 0 0 1 14 0" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/></svg></div>`,
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const defaultOccurrenceIcon = L.divIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.35)"></div>`,
  className: "",
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const clickedPinIcon = L.divIcon({
  html: `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:var(--primary,#3b82f6);transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);animation:clickPulse 1.5s ease-in-out infinite"></div>
    <div style="width:6px;height:6px;border-radius:50%;background:rgba(0,0,0,0.25);margin-top:2px"></div>
  </div>
  <style>@keyframes clickPulse{0%,100%{transform:scale(1) rotate(-45deg)}50%{transform:scale(1.15) rotate(-45deg)}}</style>`,
  className: "",
  iconSize: [28, 40],
  iconAnchor: [14, 40],
});

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

/* ── Click handler ─────────────────────────────────────────── */

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

/* ── Bounds tracker ────────────────────────────────────────── */

function BoundsTracker({
  onChange,
}: {
  onChange: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}) {
  const map = useMap();

  useEffect(() => {
    function emitBounds() {
      const b = map.getBounds();
      onChange({
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      });
    }
    // Emit initial bounds
    emitBounds();
    map.on("moveend", emitBounds);
    map.on("zoomend", emitBounds);
    return () => {
      map.off("moveend", emitBounds);
      map.off("zoomend", emitBounds);
    };
  }, [map, onChange]);

  return null;
}

/* ── FlyTo helper ──────────────────────────────────────────── */

function FlyToPosition({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 1.5 });
  }, [map, lat, lng, zoom]);
  return null;
}

/* ── User location icon ────────────────────────────────────── */

const userLocationIcon = L.divIcon({
  html: `<div style="position:relative;width:20px;height:20px">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.2);animation:locPulse 2s ease-out infinite"></div>
    <div style="position:absolute;top:4px;left:4px;width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2.5px solid white;box-shadow:0 0 6px rgba(59,130,246,0.5)"></div>
  </div>
  <style>@keyframes locPulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2.5);opacity:0}}</style>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/* ── Pole icon helpers ─────────────────────────────────────── */

const poleIcon = L.divIcon({
  html: `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="10.5" y="2" width="3" height="20" rx="1" fill="#f59e0b" stroke="white" stroke-width="1.2"/><rect x="4" y="7" width="16" height="2.5" rx="1" fill="#f59e0b" stroke="white" stroke-width="1"/><circle cx="12" cy="5" r="2" fill="#fbbf24" stroke="white" stroke-width="1"/></svg></div>`,
  className: "",
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

/* ── Legend ─────────────────────────────────────────────────── */

function Legend({ visibleLayers }: { visibleLayers: Set<string> }) {
  const map = useMap();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 640) setCollapsed(true);
  }, []);

  useEffect(() => {
    const legend = new L.Control({ position: "bottomright" });

    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "");
      div.style.cssText =
        "background:rgba(255,255,255,0.92);padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;font-size:12px;color:#1f2937;line-height:1.8;box-shadow:0 1px 4px rgba(0,0,0,0.1);cursor:pointer;user-select:none;max-height:300px;overflow-y:auto;";

      if (collapsed) {
        div.innerHTML = "<strong style='font-size:12px'>Legenda ▲</strong>";
      } else {
        let html = "<strong style='font-size:12px'>Legenda ▼</strong><br/>";

        if (visibleLayers.has("outages")) {
          html += "<strong style='color:#f59e0b'>Avarias</strong><br/>";
          html += `<span style="color:#10b981">&#9679;</span> Sem avarias<br/>`;
          html += `<span style="color:#f59e0b">&#9679;</span> 1–5 avarias<br/>`;
          html += `<span style="color:#f97316">&#9679;</span> 6–20 avarias<br/>`;
          html += `<span style="color:#ef4444">&#9679;</span> &gt;20 avarias<br/>`;
        }

        if (visibleLayers.has("substations")) {
          html += "<strong style='color:#10b981'>Subestações</strong><br/>";
          html += `<span style="color:#10b981">&#9670;</span> Carga &gt;5 MW<br/>`;
          html += `<span style="color:#f59e0b">&#9670;</span> Carga baixa<br/>`;
          html += `<span style="color:#ef4444">&#9670;</span> Sem carga<br/>`;
        }

        if (visibleLayers.has("transformers")) {
          html += "<strong style='color:#06b6d4'>Postos Transformação</strong><br/>";
          html += `<span style="color:#10b981">&#9670;</span> Util. &ge;60%<br/>`;
          html += `<span style="color:#f59e0b">&#9670;</span> Util. 40–59%<br/>`;
          html += `<span style="color:#64748b">&#9670;</span> Util. &lt;40%<br/>`;
        }

        if (visibleLayers.has("antennas")) {
          html += "<strong style='color:#6366f1'>Antenas</strong><br/>";
          html += `<span style="color:#00a3e0">&#9679;</span> MEO<br/>`;
          html += `<span style="color:#ff6600">&#9679;</span> NOS<br/>`;
          html += `<span style="color:#e60000">&#9679;</span> Vodafone<br/>`;
          html += `<span style="color:#003087">&#9679;</span> DIGI<br/>`;
          html += `<span style="color:#8b5cf6">&#9679;</span> Partilhada<br/>`;
        }

        if (visibleLayers.has("occurrences")) {
          html += "<strong style='color:#ef4444'>Ocorrências</strong><br/>";
          html += `<span style="color:#ef4444">&#9679;</span> Ativa<br/>`;
        }

        if (visibleLayers.has("reports")) {
          html += "<strong style='color:#8b5cf6'>Reportes</strong><br/>";
          html += `<span style="color:#f59e0b">&#9650;</span> Sem luz<br/>`;
          html += `<span style="color:#3b82f6">&#9650;</span> Sem rede móvel<br/>`;
          html += `<span style="color:#6366f1">&#9650;</span> Sem rede fixa<br/>`;
          html += `<span style="color:#06b6d4">&#9650;</span> Sem água<br/>`;
          html += `<span style="color:#f97316">&#9650;</span> Estrada cortada<br/>`;
        }

        if (visibleLayers.has("poles")) {
          html += "<strong style='color:#f59e0b'>Postes BT</strong><br/>";
          html += `<span style="color:#f59e0b">&#9702;</span> Poste BT<br/>`;
        }

        div.innerHTML = html;
      }

      div.onclick = (e) => {
        e.stopPropagation();
        setCollapsed((prev) => !prev);
      };

      return div;
    };

    legend.addTo(map);
    return () => { legend.remove(); };
  }, [map, collapsed, visibleLayers]);

  return null;
}

/* ── Main Component ────────────────────────────────────────── */

export function UnifiedMap({
  layers,
  visibleLayers,
  visibleOperators,
  onMapClick,
  onReportInfra,
  onUpvote,
  onResolve,
  onShare,
  onBoundsChange,
  clickedPosition,
  userLocation,
  flyTo,
}: UnifiedMapProps) {
  const outages = layers.outages ?? [];
  const substations = layers.substations ?? [];
  const transformers = layers.transformers ?? [];
  const antennas = layers.antennas ?? [];
  const occurrences = layers.occurrences ?? [];
  const reports = layers.reports ?? [];
  const poles = layers.poles ?? [];
  const hotspots = layers.hotspots ?? [];

  const filteredAntennas = visibleOperators
    ? antennas.filter((a) => a.operators.some((op) => visibleOperators.has(op)))
    : antennas;

  // Build coordinate → reports lookup for infrastructure matching
  const reportsByCoords = new Map<string, Report[]>();
  for (const r of reports) {
    const key = `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`;
    const arr = reportsByCoords.get(key);
    if (arr) arr.push(r);
    else reportsByCoords.set(key, [r]);
  }
  function findReportsAt(lat: number, lng: number): Report[] {
    return reportsByCoords.get(`${lat.toFixed(5)},${lng.toFixed(5)}`) ?? [];
  }

  return (
    <MapContainer
      center={LEIRIA_CENTER}
      zoom={10}
      className="h-full w-full"
      scrollWheelZoom={true}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="bottomleft" />
      <Legend visibleLayers={visibleLayers} />
      {onMapClick && <ClickHandler onClick={onMapClick} />}
      {onBoundsChange && <BoundsTracker onChange={onBoundsChange} />}
      {flyTo && <FlyToPosition lat={flyTo.lat} lng={flyTo.lng} zoom={flyTo.zoom} />}

      {/* ── User location ─────────────────────────────────── */}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userLocationIcon}
          zIndexOffset={900}
        >
          <Popup>
            <div style={{ fontFamily: "sans-serif", fontSize: "13px", textAlign: "center", padding: "4px 0" }}>
              <strong>A sua localização</strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#64748b" }}>
                {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
              </p>
            </div>
          </Popup>
        </Marker>
      )}

      {/* ── Clicked position pin ──────────────────────────── */}
      {clickedPosition && (
        <Marker
          position={[clickedPosition.lat, clickedPosition.lng]}
          icon={clickedPinIcon}
          zIndexOffset={1000}
        >
          <Popup>
            <div style={{ fontFamily: "sans-serif", fontSize: "13px", textAlign: "center", padding: "4px 0" }}>
              <strong>Local selecionado</strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#64748b" }}>
                {clickedPosition.lat.toFixed(5)}, {clickedPosition.lng.toFixed(5)}
              </p>
            </div>
          </Popup>
        </Marker>
      )}

      {/* ── Outages layer ─────────────────────────────────── */}
      {visibleLayers.has("outages") &&
        outages.map((m) => (
          <CircleMarker
            key={`outage-${m.name}`}
            center={[m.lat, m.lng]}
            radius={getElectricityRadius(m.outages)}
            pathOptions={{
              color: getElectricityColor(m.outages),
              fillColor: getElectricityColor(m.outages),
              fillOpacity: 0.35,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 180 }}>
                <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 6px" }}>{m.name}</p>
                <p style={{ margin: "0 0 2px", color: "#f59e0b" }}>
                  <strong>Eletricidade</strong>
                </p>
                <p style={{ margin: 0 }}>
                  Avarias:{" "}
                  <strong style={{ color: m.outages > 0 ? "#ef4444" : "#10b981" }}>
                    {m.outages}
                  </strong>
                </p>
                {m.meo && (
                  <>
                    <hr style={{ margin: "8px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />
                    <p style={{ margin: "0 0 2px", color: "#3b82f6" }}>
                      <strong>MEO</strong>
                    </p>
                    <p style={{ margin: 0 }}>
                      Móvel:{" "}
                      <strong style={{ color: getTelecomColor(m.meo.rede_movel_pct) }}>
                        {m.meo.rede_movel_pct != null ? `${m.meo.rede_movel_pct}%` : "s/d"}
                      </strong>
                    </p>
                    <p style={{ margin: 0 }}>
                      Fixa:{" "}
                      <strong style={{ color: getTelecomColor(m.meo.rede_fixa_pct) }}>
                        {m.meo.rede_fixa_pct != null ? `${m.meo.rede_fixa_pct}%` : "s/d"}
                      </strong>
                    </p>
                  </>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* ── Substations layer ─────────────────────────────── */}
      {visibleLayers.has("substations") &&
        substations.map((s) => {
          const color = getSubstationColor(s.latestLoad);
          return (
            <CircleMarker
              key={`sub-${s.name}`}
              center={[s.lat, s.lng]}
              radius={8}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.5,
                weight: 2,
                dashArray: "2 4",
              }}
            >
              <Popup>
                <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 160 }}>
                  <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 4px" }}>
                    {s.name}
                  </p>
                  <p style={{ margin: "0 0 2px", color: "#10b981" }}>
                    <strong>Subestação E-REDES</strong>
                  </p>
                  <p style={{ margin: 0 }}>
                    Carga:{" "}
                    <strong style={{ color }}>
                      {s.latestLoad != null ? `${s.latestLoad.toFixed(2)} MW` : "sem dados"}
                    </strong>
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      {/* ── Transformers (PTD) layer — clustered ──────────── */}
      {visibleLayers.has("transformers") && transformers.length > 0 && (
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iconCreateFunction={(cluster: any) => {
            const count = cluster.getChildCount();
            let dim = 30;
            if (count > 100) dim = 44;
            else if (count > 30) dim = 36;
            return L.divIcon({
              html: `<div style="background:rgba(6,182,212,0.75);color:white;border-radius:50%;width:${dim}px;height:${dim}px;display:flex;align-items:center;justify-content:center;font-size:${dim > 36 ? 13 : 11}px;font-weight:600;border:2px solid rgba(255,255,255,0.8);box-shadow:0 2px 6px rgba(0,0,0,0.3)">${count}</div>`,
              className: "",
              iconSize: L.point(dim, dim),
            });
          }}
        >
          {transformers.map((t, i) => {
            const existingReports = findReportsAt(t.lat, t.lng);
            const hasReport = existingReports.length > 0;
            return (
              <Marker key={`ptd-${i}`} position={[t.lat, t.lng]} icon={createPtdIcon(t.usage)}>
                <Popup>
                  <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 160 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 4px" }}>
                      <p style={{ fontWeight: 700, fontSize: "14px", margin: 0, color: "#06b6d4" }}>
                        Posto de Transformação
                      </p>
                      <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                        {t.id}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 2px" }}>
                      Concelho: <strong>{t.municipality}</strong>
                    </p>
                    <p style={{ margin: "0 0 2px" }}>
                      Potência: <strong>{t.kva} kVA</strong>
                    </p>
                    <p style={{ margin: "0 0 2px" }}>
                      Utilização: <strong style={{ color: getPtdColor(t.usage) }}>{t.usage}</strong>
                    </p>
                    <p style={{ margin: "0 0 2px" }}>
                      Clientes: <strong>{t.clients}</strong>
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                      {t.lat.toFixed(5)}, {t.lng.toFixed(5)}
                    </p>
                    {hasReport ? (
                      <div style={{ marginTop: 10, padding: "6px 8px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca" }}>
                        <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 700, color: "#dc2626" }}>
                          Problema reportado
                        </p>
                        {existingReports[0].description && (
                          <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#64748b" }}>
                            {existingReports[0].description}
                          </p>
                        )}
                        <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#94a3b8" }}>
                          {timeAgo(existingReports[0].createdAt)} · {existingReports[0].upvotes} confirmação{existingReports[0].upvotes !== 1 ? "ões" : ""}
                        </p>
                        <div style={{ display: "flex", gap: 6 }}>
                          {onUpvote && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onUpvote(existingReports[0].id); }}
                              style={{
                                flex: 1, padding: "4px 8px", fontSize: "12px", borderRadius: 6,
                                border: "1px solid #334e68", background: "#1e3a5f", color: "#93c5fd",
                                cursor: "pointer",
                              }}
                            >
                              +1 Confirmo
                            </button>
                          )}
                          {onResolve && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onResolve(existingReports[0].id); }}
                              style={{
                                flex: 1, padding: "4px 8px", fontSize: "12px", borderRadius: 6,
                                border: "1px solid #334e68", background: "#1a332e", color: "#6ee7b7",
                                cursor: "pointer",
                              }}
                            >
                              Resolvido
                            </button>
                          )}
                        </div>
                      </div>
                    ) : onReportInfra ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReportInfra({
                            lat: t.lat,
                            lng: t.lng,
                            label: "Posto de Transformação",
                            type: "electricity",
                            operator: null,
                            details: [
                              `Concelho: ${t.municipality}`,
                              `Potência: ${t.kva} kVA`,
                              `Utilização: ${t.usage}`,
                              `Clientes: ${t.clients}`,
                            ],
                          });
                        }}
                        style={{
                          marginTop: 10, padding: "5px 12px", fontSize: "12px", borderRadius: 6,
                          border: "1px solid #dc2626", background: "#fef2f2", color: "#dc2626",
                          cursor: "pointer", fontWeight: 600, width: "100%",
                        }}
                      >
                        Reportar problema
                      </button>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}

      {/* ── Antennas layer — clustered ────────────────────── */}
      {visibleLayers.has("antennas") && filteredAntennas.length > 0 && (
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iconCreateFunction={(cluster: any) => {
            const count = cluster.getChildCount();
            let dim = 34;
            if (count > 100) dim = 48;
            else if (count > 30) dim = 40;
            return L.divIcon({
              html: `<div style="background:rgba(99,102,241,0.85);color:white;border-radius:50%;width:${dim}px;height:${dim}px;display:flex;align-items:center;justify-content:center;font-size:${dim > 40 ? 14 : 12}px;font-weight:600;border:2px solid rgba(255,255,255,0.85);box-shadow:0 2px 8px rgba(0,0,0,0.3)">${count}</div>`,
              className: "",
              iconSize: L.point(dim, dim),
            });
          }}
        >
          {filteredAntennas.map((a, i) => {
            const existingReports = findReportsAt(a.lat, a.lng);
            const hasReport = existingReports.length > 0;
            return (
              <Marker key={`ant-${i}`} position={[a.lat, a.lng]} icon={createAntennaIcon(a.operators)}>
                <Popup>
                  <div style={{ fontFamily: "sans-serif", fontSize: "14px", lineHeight: "1.7", minWidth: 180, maxWidth: 240 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 6px" }}>
                      <p style={{ fontWeight: 700, fontSize: "15px", margin: 0, color: "#1f2937" }}>
                        {a.operators.length > 1 ? "Antena partilhada" : `Antena ${a.operators[0]}`}
                      </p>
                      <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                        ANT-{a.id}
                      </span>
                    </div>
                    {a.operators.map((op) => (
                      <p key={op} style={{ margin: "0 0 2px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: OPERATOR_COLORS[op] ?? "#64748b",
                            marginRight: 6,
                            verticalAlign: "middle",
                          }}
                        />
                        <strong>{op}</strong>
                      </p>
                    ))}
                    {a.technologies.length > 0 && (
                      <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b" }}>
                        {a.technologies.map((t) => TECH_LABELS[t] ?? t).join(" · ")}
                      </p>
                    )}
                    <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                      {a.lat.toFixed(5)}, {a.lng.toFixed(5)}
                    </p>
                    {hasReport ? (
                      <div style={{ marginTop: 10, padding: "6px 8px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca" }}>
                        <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 700, color: "#dc2626" }}>
                          Problema reportado
                        </p>
                        {existingReports[0].description && (
                          <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#64748b" }}>
                            {existingReports[0].description}
                          </p>
                        )}
                        <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#94a3b8" }}>
                          {timeAgo(existingReports[0].createdAt)} · {existingReports[0].upvotes} confirmação{existingReports[0].upvotes !== 1 ? "ões" : ""}
                        </p>
                        <div style={{ display: "flex", gap: 6 }}>
                          {onUpvote && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onUpvote(existingReports[0].id); }}
                              style={{
                                flex: 1, padding: "4px 8px", fontSize: "12px", borderRadius: 6,
                                border: "1px solid #334e68", background: "#1e3a5f", color: "#93c5fd",
                                cursor: "pointer",
                              }}
                            >
                              +1 Confirmo
                            </button>
                          )}
                          {onResolve && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onResolve(existingReports[0].id); }}
                              style={{
                                flex: 1, padding: "4px 8px", fontSize: "12px", borderRadius: 6,
                                border: "1px solid #334e68", background: "#1a332e", color: "#6ee7b7",
                                cursor: "pointer",
                              }}
                            >
                              Resolvido
                            </button>
                          )}
                        </div>
                      </div>
                    ) : onReportInfra ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReportInfra({
                            lat: a.lat,
                            lng: a.lng,
                            label: a.operators.length > 1
                              ? "Antena partilhada"
                              : `Antena ${a.operators[0]}`,
                            type: "telecom_mobile",
                            operator: a.operators.length === 1 ? a.operators[0] : null,
                            details: [
                              `Operadores: ${a.operators.join(", ")}`,
                              ...(a.technologies.length > 0
                                ? [`Tecnologias: ${a.technologies.join(", ")}`]
                                : []),
                            ],
                          });
                        }}
                        style={{
                          marginTop: 10, padding: "5px 12px", fontSize: "12px", borderRadius: 6,
                          border: "1px solid #dc2626", background: "#fef2f2", color: "#dc2626",
                          cursor: "pointer", fontWeight: 600, width: "100%",
                        }}
                      >
                        Reportar problema
                      </button>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}

      {/* ── Occurrences layer ─────────────────────────────── */}
      {visibleLayers.has("occurrences") &&
        occurrences
          .filter((o) => o.coordinates != null)
          .map((o) => (
            <Marker
              key={`occ-${o.id}`}
              position={[o.coordinates!.lat, o.coordinates!.lng]}
              icon={defaultOccurrenceIcon}
            >
              <Popup>
                <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 160 }}>
                  <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 4px", color: "#ef4444" }}>
                    {o.nature ?? "Ocorrência"}
                  </p>
                  <p style={{ margin: "0 0 2px" }}>{o.municipality}</p>
                  {o.state && <p style={{ margin: "0 0 2px" }}>Estado: {o.state}</p>}
                  {o.numMeans != null && <p style={{ margin: "0 0 2px" }}>Meios: {o.numMeans}</p>}
                  {o.numOperatives != null && <p style={{ margin: "0 0 2px" }}>Operacionais: {o.numOperatives}</p>}
                  {o.startTime && (
                    <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#94a3b8" }}>
                      Início: {new Date(o.startTime).toLocaleString("pt-PT")}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

      {/* ── Reports layer ─────────────────────────────────── */}
      {visibleLayers.has("reports") &&
        reports.map((r) => {
          const color = getReportColor(r.type, r.operator);
          const stale = isStale(r);
          const priorityBase = r.priority === "urgente" ? 10 : r.priority === "importante" ? 8 : 6;
          const baseRadius = Math.min(priorityBase + r.upvotes * 1.5, 22);
          const radius = stale ? baseRadius * 0.6 : baseRadius;
          const borderColor = r.priority === "urgente" ? "#ef4444" : r.priority === "importante" ? "#f97316" : color;
          const weight = r.priority === "urgente" ? 3 : 2;
          return (
            <CircleMarker
              key={`report-${r.id}`}
              center={[r.lat, r.lng]}
              radius={radius}
              pathOptions={{
                color: borderColor,
                fillColor: color,
                fillOpacity: stale ? 0.15 : 0.45,
                weight,
                dashArray: stale ? "4 4" : undefined,
              }}
              className={r.priority === "urgente" ? "report-urgente" : undefined}
            >
              <Popup>
                <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color }} />
                    <strong style={{ fontSize: "14px" }}>
                      {getReportLabel(r.type, r.operator)}
                    </strong>
                  </div>
                  {r.priority && r.priority !== "normal" && (
                    <span style={{
                      display: "inline-block",
                      padding: "1px 8px",
                      borderRadius: 9999,
                      fontSize: "11px",
                      fontWeight: 700,
                      marginBottom: 6,
                      color: "white",
                      background: r.priority === "urgente" ? "#ef4444" : "#f97316",
                    }}>
                      {r.priority === "urgente" ? "Urgente" : "Importante"}
                    </span>
                  )}
                  {r.street && (
                    <p style={{ margin: "2px 0", fontSize: "12px", color: "#64748b" }}>{r.street}</p>
                  )}
                  {r.parish && (
                    <p style={{ margin: "2px 0", fontSize: "11px", color: "#94a3b8" }}>
                      Freguesia: {r.parish}
                    </p>
                  )}
                  {r.description && <p style={{ margin: "4px 0" }}>{r.description}</p>}
                  {r.imageUrl && (
                    <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", margin: "6px 0" }}>
                      <img
                        src={r.imageUrl}
                        alt="Foto do reporte"
                        style={{ maxWidth: 200, borderRadius: 8, cursor: "pointer" }}
                      />
                    </a>
                  )}
                  <p style={{ margin: "6px 0 2px", fontSize: "11px", color: "#94a3b8" }}>
                    {timeAgo(r.createdAt)} · {r.upvotes} confirmação{r.upvotes !== 1 ? "ões" : ""}
                  </p>
                  {stale && (
                    <p style={{ margin: "2px 0 6px", fontSize: "10px", color: "#f59e0b" }}>
                      Sem confirmação recente
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {onUpvote && (
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
                    )}
                    {onResolve && (
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
                    )}
                    {onShare && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onShare(r.id); }}
                        style={{
                          padding: "4px 10px", fontSize: "12px", borderRadius: 6,
                          border: "1px solid #334e68", background: "#1e293b", color: "#94a3b8",
                          cursor: "pointer",
                        }}
                      >
                        Partilhar
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      {/* ── Hotspot overlay ────────────────────────────────── */}
      {visibleLayers.has("reports") &&
        hotspots.map((h, i) => (
          <CircleMarker
            key={`hotspot-${i}`}
            center={[h.lat, h.lng]}
            radius={30}
            pathOptions={{
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.12,
              weight: 2,
              dashArray: "6 4",
            }}
          >
            <Popup>
              <div style={{ fontFamily: "sans-serif", fontSize: "13px", textAlign: "center", padding: "4px 0" }}>
                <p style={{ fontWeight: 700, fontSize: "15px", margin: "0 0 4px", color: "#ef4444" }}>
                  Zona Crítica
                </p>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  <strong>{h.count}</strong> reportes nas últimas 24h
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* ── Poles (BT) layer — clustered, zoom gated ─────── */}
      {visibleLayers.has("poles") && poles.length > 0 && (
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          disableClusteringAtZoom={18}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iconCreateFunction={(cluster: any) => {
            const count = cluster.getChildCount();
            let dim = 28;
            if (count > 500) dim = 44;
            else if (count > 100) dim = 36;
            else if (count > 30) dim = 32;
            return L.divIcon({
              html: `<div style="background:rgba(245,158,11,0.7);color:white;border-radius:50%;width:${dim}px;height:${dim}px;display:flex;align-items:center;justify-content:center;font-size:${dim > 36 ? 12 : 10}px;font-weight:600;border:2px solid rgba(255,255,255,0.8);box-shadow:0 2px 6px rgba(0,0,0,0.3)">${count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}</div>`,
              className: "",
              iconSize: L.point(dim, dim),
            });
          }}
        >
          {poles.map((p) => (
            <Marker key={`pole-${p.id}`} position={[p.lat, p.lng]} icon={poleIcon}>
              <Popup>
                <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 160 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 4px" }}>
                    <p style={{ fontWeight: 700, fontSize: "14px", margin: 0, color: "#f59e0b" }}>
                      Poste BT
                    </p>
                    <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                      POL-{p.id}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </p>
                  {onReportInfra && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReportInfra({
                          lat: p.lat,
                          lng: p.lng,
                          label: "Poste de Baixa Tensão",
                          type: "electricity",
                          operator: null,
                          details: [`ID: POL-${p.id}`],
                        });
                      }}
                      style={{
                        marginTop: 10, padding: "5px 12px", fontSize: "12px", borderRadius: 6,
                        border: "1px solid #dc2626", background: "#fef2f2", color: "#dc2626",
                        cursor: "pointer", fontWeight: 600, width: "100%",
                      }}
                    >
                      Reportar problema
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}
    </MapContainer>
  );
}
