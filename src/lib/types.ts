export interface ElectricityData {
  success: boolean;
  timestamp: string;
  source: string;
  leiria: {
    active_outages: {
      total_outage_count: number;
      municipalities_affected: number;
      records: OutageAuxiliarRecord[];
      extraction_datetime: string | null;
    } | null;
    scheduled_interruptions: {
      total_records: number;
      records: ScheduledRecord[];
    } | null;
  };
  national: {
    total_active_outages: number | null;
  };
  transformers: TransformerSummary | null;
}

export interface TransformerSummary {
  total_count: number;
  total_clients: number;
  total_capacity_kva: number;
  usage_levels: { level: string; count: number }[];
}

export interface OutageAuxiliarRecord {
  municipality: string;
  count: number;
  extraction_datetime: string;
}

export interface ScheduledRecord {
  postal_code: string;
  locality: string;
  district: string;
  municipality: string;
  start_time: string;
  end_time: string;
  reason: string;
}

export interface WeatherData {
  success: boolean;
  timestamp: string;
  warnings: WeatherWarning[];
  forecast: ForecastDay[];
}

export interface WeatherWarning {
  area: string;
  type: string;
  level: string;
  level_label: string;
  level_color: string;
  text: string;
  start: string;
  end: string;
}

export interface ForecastDay {
  date: string;
  temp_min: string;
  temp_max: string;
  precipitation_prob: string;
  wind_direction: string;
  wind_class: number;
}

export interface OperatorIncident {
  operator: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  affected_services: string[];
  source_url: string;
}

export interface TelecomData {
  success: boolean;
  timestamp: string;
  operators: OperatorStatus[];
  operator_incidents: OperatorIncident[];
  meo_availability: MeoAvailability;
  kristin_impact: {
    last_known_affected_clients: number;
    last_known_date: string;
    most_affected_operators: string[];
    most_affected_areas: string[];
    note: string;
  };
  tips: Record<string, string>;
}

export interface OperatorStatus {
  name: string;
  reachable: boolean;
  response_time_ms: number | null;
  color: string;
}

export interface MeoAvailability {
  success: boolean;
  last_updated: string | null;
  global: {
    rede_fixa_pct: number | null;
    rede_fixa_previsao_95: string;
    rede_movel_pct: number | null;
    rede_movel_previsao_95: string;
  } | null;
  concelhos: MeoConcelhoData[];
  leiria_district: MeoConcelhoData[];
  leiria_concelho: MeoConcelhoData | null;
  source_url: string;
  fetched_at: string;
}

export interface MeoConcelhoData {
  concelho: string;
  distrito: string;
  rede_fixa_pct: number | null;
  rede_fixa_previsao: string;
  rede_movel_pct: number | null;
  rede_movel_previsao: string;
  is_leiria_district: boolean;
}

export interface SmasAnnouncement {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  link: string;
}

export interface WaterData {
  success: boolean;
  timestamp: string;
  note: string;
  smas_website: {
    reachable: boolean;
    response_time_ms: number | null;
    url: string;
  };
  announcements: SmasAnnouncement[];
  kristin_impact: {
    note: string;
    affected_areas: string[];
    dgs_advisory: string;
    ersar_advisory: string;
    last_updated: string;
  };
  contacts: {
    smas_leiria: {
      phone: string;
      emergency: string;
      address: string;
    };
  };
}

// Recovery / Reerguer Leiria types
export interface RecoveryData {
  success: boolean;
  timestamp: string;
  summary: {
    platforms_online: number;
    platforms_total: number;
    calamity_status: string;
    calamity_until: string;
    municipalities_affected: number;
    total_support_package: string;
  };
  gabinete: GabineteInfo;
  platforms: PlatformStatus[];
  support_areas: SupportArea[];
  calamity: CalamityInfo;
  links: Record<string, string>;
}

export interface GabineteInfo {
  name: string;
  location: string;
  coordinates: { lat: number; lng: number };
  schedule: string;
  opened: string;
  num_counters: number;
  areas: string[];
  email: string;
  note: string;
  first_day_visitors: number;
}

export interface PlatformStatus {
  id: string;
  name: string;
  description: string;
  url: string;
  entity: string;
  reachable: boolean;
  response_time_ms: number | null;
  checked_at: string;
}

export interface SupportArea {
  id: string;
  title: string;
  icon: string;
  supports: SupportItem[];
}

export interface SupportItem {
  name: string;
  description: string;
  platform: string;
  url: string | null;
  docs_required: string[];
}

// Substation load data types
export interface SubstationEntry {
  name: string;
  latestLoad: number | null;
}

export interface SubstationData {
  success: boolean;
  timestamp: string;
  substations: SubstationEntry[];
  baseline: number;
  actual: { time: string; totalLoad: number }[];
  projection: { time: string; projectedLoad: number }[];
}

// Antenna data types
export interface AntennaFeature {
  lat: number;
  lng: number;
  operators: string[];
  owner: string | null;
  type: string;
  technologies: string[];
}

export interface AntennaData {
  success: boolean;
  timestamp: string;
  antennas: AntennaFeature[];
  summary: {
    total: number;
    by_operator: { operator: string; count: number; color: string }[];
    by_owner: { owner: string; count: number }[];
  };
}

// Transformer station (PTD) types
export interface TransformerMarker {
  lat: number;
  lng: number;
  kva: number;
  usage: string;
  clients: number;
  municipality: string;
}

// Per-concelho / per-parish dashboard
export interface AreaDashboardData {
  success: boolean;
  timestamp: string;
  concelho: string;
  parish: string | null;
  reports: {
    total: number;
    byType: Record<string, number>;
    parishes: string[];
  };
  recentReports: {
    id: number;
    type: string;
    operator: string | null;
    description: string | null;
    street: string | null;
    parish: string | null;
    lat: number;
    lng: number;
    upvotes: number;
    priority: string;
    lastUpvotedAt: string | null;
    imageUrl: string | null;
    createdAt: string;
  }[];
  transformers: { total: number; avgUsage: string | null } | null;
  parishes: string[];
}

export interface CalamityInfo {
  status: string;
  extended_until: string;
  municipalities_count: number;
  total_package: string;
  deaths_total: number;
  storms: string[];
  structure_mission: {
    name: string;
    coordinator: string;
    hq: string;
    started: string;
  };
}
