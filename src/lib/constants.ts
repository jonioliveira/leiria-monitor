export const LEIRIA_MUNICIPALITIES = [
  "Leiria",
  "Pombal",
  "Marinha Grande",
  "Alcobaça",
  "Batalha",
  "Porto de Mós",
  "Nazaré",
  "Ansião",
  "Alvaiázere",
  "Castanheira de Pera",
  "Figueiró dos Vinhos",
  "Pedrógão Grande",
  "Ourém",
  "Caldas da Rainha",
  "Peniche",
] as const;

// Uppercase versions for ANEPC filtering
export const LEIRIA_MUNICIPALITIES_UPPER = LEIRIA_MUNICIPALITIES.map((m) =>
  m.toUpperCase()
);

export const EREDES_BASE = "https://e-redes.opendatasoft.com/api/explore/v2.1";
export const EREDES_OUTAGES_DATASET = "outages-auxiliar";
export const EREDES_SCHEDULED_DATASET = "network-scheduling-work";

export const IPMA_WARNINGS_URL =
  "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json";
export const IPMA_FORECAST_URL =
  "https://api.ipma.pt/open-data/forecast/meteorology/cities/daily";
export const IPMA_LEIRIA_CITY_ID = 1100900;
export const IPMA_LEIRIA_AREA_ID = "LRA";

export const ANEPC_FEATURE_SERVER =
  "https://services8.arcgis.com/NIGDS8MzSPVhBAWC/arcgis/rest/services/Ocorrencias_ProCiv_AGOL/FeatureServer/8/query";

export const CRON_INTERVALS = {
  ipma: "*/15 * * * *",
  prociv: "*/10 * * * *",
  eredes: "*/30 * * * *",
  snapshot: "0 */6 * * *",
} as const;

// Municipality centroids (approximate) for map display
export const MUNICIPALITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Leiria": { lat: 39.7436, lng: -8.8071 },
  "Pombal": { lat: 39.9153, lng: -8.6285 },
  "Marinha Grande": { lat: 39.7481, lng: -8.9320 },
  "Alcobaça": { lat: 39.5481, lng: -8.9773 },
  "Batalha": { lat: 39.6603, lng: -8.8246 },
  "Porto de Mós": { lat: 39.6019, lng: -8.8178 },
  "Nazaré": { lat: 39.6019, lng: -9.0699 },
  "Ansião": { lat: 39.9105, lng: -8.4344 },
  "Alvaiázere": { lat: 39.8265, lng: -8.3820 },
  "Castanheira de Pera": { lat: 39.9927, lng: -8.2061 },
  "Figueiró dos Vinhos": { lat: 39.9024, lng: -8.2732 },
  "Pedrógão Grande": { lat: 39.9194, lng: -8.1430 },
  "Ourém": { lat: 39.6621, lng: -8.5860 },
  "Caldas da Rainha": { lat: 39.4031, lng: -9.1365 },
  "Peniche": { lat: 39.3558, lng: -9.3810 },
  "Óbidos": { lat: 39.3620, lng: -9.1571 },
  "Bombarral": { lat: 39.2682, lng: -9.1568 },
  "Lourinhã": { lat: 39.2416, lng: -9.3114 },
  "Cadaval": { lat: 39.2425, lng: -9.1023 },
};

// IPMA awareness type mapping
export const AWARENESS_TYPES: Record<string, string> = {
  "1": "Vento",
  "2": "Chuva",
  "3": "Neve",
  "4": "Trovoada",
  "5": "Nevoeiro",
  "6": "Frio extremo",
  "7": "Calor extremo",
  "8": "Ondas costeiras",
  "9": "Incêndios",
  "10": "Precipitação",
  "11": "Agitação marítima",
};

export const AWARENESS_LEVELS: Record<
  string,
  { label: string; color: string }
> = {
  green: { label: "Sem Aviso", color: "#10b981" },
  yellow: { label: "Amarelo", color: "#f59e0b" },
  orange: { label: "Laranja", color: "#f97316" },
  red: { label: "Vermelho", color: "#ef4444" },
};
