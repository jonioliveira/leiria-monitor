"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

interface MunicipalityData {
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

interface InfrastructureMapProps {
  municipalities: MunicipalityData[];
  layer: "electricity" | "telecom" | "both";
}

const LEIRIA_CENTER: [number, number] = [39.65, -8.75];

function getElectricityColor(outages: number): string {
  if (outages === 0) return "#10b981"; // green
  if (outages <= 5) return "#f59e0b"; // amber
  if (outages <= 20) return "#f97316"; // orange
  return "#ef4444"; // red
}

function getElectricityRadius(outages: number): number {
  if (outages === 0) return 8;
  if (outages <= 5) return 12;
  if (outages <= 20) return 16;
  if (outages <= 50) return 20;
  return 24;
}

function getTelecomColor(movelPct: number | null): string {
  if (movelPct == null) return "#64748b"; // slate (no data)
  if (movelPct >= 95) return "#10b981";
  if (movelPct >= 80) return "#f59e0b";
  if (movelPct >= 50) return "#f97316";
  return "#ef4444";
}

// Component to add legend to the map
function Legend({ layer }: { layer: "electricity" | "telecom" | "both" }) {
  const map = useMap();

  useEffect(() => {
    const legend = new L.Control({ position: "bottomright" });

    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "");
      div.style.cssText =
        "background: rgba(255,255,255,0.92); padding: 10px 14px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 12px; color: #1f2937; line-height: 1.8; box-shadow: 0 1px 4px rgba(0,0,0,0.1);";

      let html = "";

      if (layer === "electricity" || layer === "both") {
        html += "<strong style='color:#f59e0b'>Eletricidade</strong><br/>";
        html += `<span style="color:#10b981">&#9679;</span> Sem avarias<br/>`;
        html += `<span style="color:#f59e0b">&#9679;</span> 1–5 avarias<br/>`;
        html += `<span style="color:#f97316">&#9679;</span> 6–20 avarias<br/>`;
        html += `<span style="color:#ef4444">&#9679;</span> &gt;20 avarias<br/>`;
      }

      if (layer === "both") html += "<br/>";

      if (layer === "telecom" || layer === "both") {
        html += "<strong style='color:#3b82f6'>Telecomunicações (MEO)</strong><br/>";
        html += `<span style="color:#10b981">&#9632;</span> &ge;95% cobertura<br/>`;
        html += `<span style="color:#f59e0b">&#9632;</span> 80–94%<br/>`;
        html += `<span style="color:#f97316">&#9632;</span> 50–79%<br/>`;
        html += `<span style="color:#ef4444">&#9632;</span> &lt;50%<br/>`;
        html += `<span style="color:#64748b">&#9632;</span> Sem dados<br/>`;
      }

      div.innerHTML = html;
      return div;
    };

    legend.addTo(map);
    return () => { legend.remove(); };
  }, [map, layer]);

  return null;
}

export function InfrastructureMap({ municipalities, layer }: InfrastructureMapProps) {
  return (
    <MapContainer
      center={LEIRIA_CENTER}
      zoom={10}
      className="h-[500px] w-full rounded-lg"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Legend layer={layer} />

      {municipalities.map((m) => {
        const showElectricity = layer === "electricity" || layer === "both";
        const showTelecom = layer === "telecom" || layer === "both";

        return (
          <span key={m.name}>
            {/* Electricity circle */}
            {showElectricity && (
              <CircleMarker
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
                      Avarias: <strong style={{ color: m.outages > 0 ? "#ef4444" : "#10b981" }}>
                        {m.outages}
                      </strong>
                    </p>

                    {m.meo && (
                      <>
                        <hr style={{ margin: "8px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />
                        <p style={{ margin: "0 0 2px", color: "#3b82f6" }}>
                          <strong>Telecomunicações (MEO)</strong>
                        </p>
                        <p style={{ margin: 0 }}>
                          Rede móvel: <strong style={{ color: getTelecomColor(m.meo.rede_movel_pct) }}>
                            {m.meo.rede_movel_pct != null ? `${m.meo.rede_movel_pct}%` : "s/d"}
                          </strong>
                          {m.meo.rede_movel_previsao && (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                              {" "}(prev. {m.meo.rede_movel_previsao})
                            </span>
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          Rede fixa: <strong style={{ color: getTelecomColor(m.meo.rede_fixa_pct) }}>
                            {m.meo.rede_fixa_pct != null ? `${m.meo.rede_fixa_pct}%` : "s/d"}
                          </strong>
                          {m.meo.rede_fixa_previsao && (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                              {" "}(prev. {m.meo.rede_fixa_previsao})
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            )}

            {/* Telecom square marker (offset slightly if showing both) */}
            {showTelecom && m.meo && (
              <CircleMarker
                center={[
                  m.lat + (showElectricity ? 0.02 : 0),
                  m.lng + (showElectricity ? 0.02 : 0),
                ]}
                radius={10}
                pathOptions={{
                  color: getTelecomColor(m.meo.rede_movel_pct),
                  fillColor: getTelecomColor(m.meo.rede_movel_pct),
                  fillOpacity: 0.5,
                  weight: 2,
                  dashArray: "4",
                }}
              >
                <Popup>
                  <div style={{ fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.6", minWidth: 180 }}>
                    <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 6px" }}>{m.name}</p>
                    <p style={{ margin: "0 0 2px", color: "#3b82f6" }}>
                      <strong>MEO — Disponibilidade</strong>
                    </p>
                    <p style={{ margin: 0 }}>
                      Rede móvel: <strong style={{ color: getTelecomColor(m.meo.rede_movel_pct) }}>
                        {m.meo.rede_movel_pct != null ? `${m.meo.rede_movel_pct}%` : "sem dados"}
                      </strong>
                    </p>
                    <p style={{ margin: 0 }}>
                      Rede fixa: <strong style={{ color: getTelecomColor(m.meo.rede_fixa_pct) }}>
                        {m.meo.rede_fixa_pct != null ? `${m.meo.rede_fixa_pct}%` : "sem dados"}
                      </strong>
                    </p>
                    {m.meo.rede_movel_previsao && (
                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#94a3b8" }}>
                        Previsão móvel 95%: {m.meo.rede_movel_previsao}
                      </p>
                    )}
                    {m.meo.rede_fixa_previsao && (
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#94a3b8" }}>
                        Previsão fixa 95%: {m.meo.rede_fixa_previsao}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </span>
        );
      })}
    </MapContainer>
  );
}
