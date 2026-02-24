/**
 * Telecom scraping logic — shared between /api/telecom and /api/cron/telecom.
 * All external HTTP calls live here so neither route does live fetching itself.
 */

const OPERATOR_ENDPOINTS = [
  { name: "MEO", url: "https://www.meo.pt", color: "#00a3e0" },
  { name: "NOS", url: "https://www.nos.pt", color: "#ff6600" },
  { name: "Vodafone", url: "https://www.vodafone.pt", color: "#e60000" },
  { name: "DIGI", url: "https://www.dfrportuguese.com", color: "#003087" },
];

const MEO_APP_URL =
  "https://app-ef66ba3b-3a54-42d4-9559-560dd50c913d.apps.meo.pt/Pages/Default.aspx?SenderId=346DB3AC0";
const MEO_AVAILABILITY_URL = "https://www.meo.pt/disponibilidade-servicos-meo";
const NOS_INCIDENTS_URL = "https://www.nos.pt/ocorrencias";
const VODAFONE_STATUS_URL = "https://www.vodafone.pt/info/estado-da-rede.html";
const ANACOM_KRISTIN_URL = "https://www.anacom.pt/render.jsp?contentId=1826541";

function parsePercentage(text: string): number | null {
  const match = text.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function checkEndpoint(endpoint: (typeof OPERATOR_ENDPOINTS)[0]) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint.url, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return {
      name: endpoint.name,
      reachable: res.ok || res.status < 500,
      response_time_ms: Date.now() - start,
      color: endpoint.color,
    };
  } catch {
    return { name: endpoint.name, reachable: false, response_time_ms: null, color: endpoint.color };
  }
}

type MeoConcelhoEntry = {
  concelho: string;
  distrito: string;
  rede_fixa_pct: number | null;
  rede_fixa_previsao: string;
  rede_movel_pct: number | null;
  rede_movel_previsao: string;
  is_leiria_district: boolean;
};

async function scrapeMeoAvailability() {
  const result: {
    success: boolean;
    last_updated: string | null;
    global: { rede_fixa_pct: number | null; rede_fixa_previsao_95: string; rede_movel_pct: number | null; rede_movel_previsao_95: string } | null;
    concelhos: MeoConcelhoEntry[];
    leiria_district: MeoConcelhoEntry[];
    leiria_concelho: MeoConcelhoEntry | null;
    source_url: string;
    fetched_at: string;
  } = {
    success: false,
    last_updated: null,
    global: null,
    concelhos: [],
    leiria_district: [],
    leiria_concelho: null,
    source_url: MEO_AVAILABILITY_URL,
    fetched_at: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(MEO_APP_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)", Accept: "text/html" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return result;

    const html = await res.text();

    const dateMatch = html.match(/Atualizado\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dateMatch) result.last_updated = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

    const globalSection = html.match(/Situa[çc][ãa]o global[\s\S]*?<\/ul>\s*<\/div>/i);
    if (globalSection) {
      const pValues = [...globalSection[0].matchAll(/<ul class="table-info-item-descriptions">([\s\S]*?)<\/ul>/gi)];
      const extractValues = (ulContent: string): string[] =>
        [...ulContent.matchAll(/<li>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>/gi)].map((m) => stripHtml(m[2]));
      if (pValues.length >= 2) {
        const fixaVals = extractValues(pValues[0][1]);
        const movelVals = extractValues(pValues[1][1]);
        result.global = {
          rede_fixa_pct: fixaVals[0] ? parsePercentage(fixaVals[0]) : null,
          rede_fixa_previsao_95: fixaVals[1] ?? "",
          rede_movel_pct: movelVals[0] ? parsePercentage(movelVals[0]) : null,
          rede_movel_previsao_95: movelVals[1] ?? "",
        };
      }
    }

    const poisMatch = html.match(/defaultPOIs\s*:\s*(\[[\s\S]*?\])\s*,/);
    if (poisMatch) {
      try {
        const pois: { Name: string; Address: string; PercentLandline: string; DateLandline: string; PercentMobile: string; DateMobile: string }[] =
          JSON.parse(poisMatch[1]);

        for (const poi of pois) {
          const capitalize = (w: string) => {
            const lower = w.toLowerCase();
            if (["de", "do", "da", "dos", "das", "a", "e", "o"].includes(lower)) return lower;
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          };
          const concelho = poi.Name.split(" ").map(capitalize).join(" ");
          const distrito = poi.Address.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          const fixaPrevisao = poi.DateLandline?.includes("95%") ? "Disponibilidade >= 95%" : poi.DateLandline ?? "";
          const movelPrevisao = poi.DateMobile?.includes("95%") ? "Disponibilidade >= 95%" : poi.DateMobile ?? "";
          const entry = {
            concelho,
            distrito,
            rede_fixa_pct: parsePercentage(poi.PercentLandline),
            rede_fixa_previsao: fixaPrevisao,
            rede_movel_pct: parsePercentage(poi.PercentMobile),
            rede_movel_previsao: movelPrevisao,
            is_leiria_district: distrito === "Leiria",
          };
          result.concelhos.push(entry);
          if (entry.is_leiria_district) result.leiria_district.push(entry);
          if (poi.Name.toUpperCase() === "LEIRIA" && distrito === "Leiria") result.leiria_concelho = entry;
        }
      } catch { /* JSON parse failed */ }
    }

    result.success = result.concelhos.length > 0;
  } catch { /* scrape failed */ }

  return result;
}

async function scrapeNosIncidents() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(NOS_INCIDENTS_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)", Accept: "text/html" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    const incidents: { operator: string; title: string; description: string; start_date: null; end_date: null; affected_services: string[]; source_url: string }[] = [];
    const incidentBlockPattern = /<(?:h[2-4]|strong)[^>]*>([^<]*(?:situa[çc][ãa]|interrup[çc][ãa]|ocorr[êe]ncia|avaria|incidente)[^<]*)<\/(?:h[2-4]|strong)>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = incidentBlockPattern.exec(html)) !== null) {
      const title = stripHtml(match[1]);
      const description = stripHtml(match[2]);
      if (description.toLowerCase().includes("leiria") || description.toLowerCase().includes("centro") || title.toLowerCase().includes("leiria")) {
        const services: string[] = [];
        if (/TV|televis/i.test(description)) services.push("TV");
        if (/internet\s+fixa|rede\s+fixa/i.test(description)) services.push("Internet Fixa");
        if (/internet\s+m[oó]vel|rede\s+m[oó]vel/i.test(description)) services.push("Internet Móvel");
        if (/telefone\s+fixo|voz\s+fixa/i.test(description)) services.push("Telefone Fixo");
        if (/telefone\s+m[oó]vel|voz\s+m[oó]vel/i.test(description)) services.push("Telefone Móvel");
        incidents.push({ operator: "NOS", title: title || "Ocorrência NOS", description, start_date: null, end_date: null, affected_services: services.length > 0 ? services : ["Vários serviços"], source_url: NOS_INCIDENTS_URL });
      }
    }
    if (incidents.length === 0) {
      const simpleLeiriaPattern = /<p[^>]*>([^<]*(?:Leiria)[^<]*)<\/p>/gi;
      while ((match = simpleLeiriaPattern.exec(html)) !== null) {
        const text = stripHtml(match[1]);
        if (text.length > 20) { incidents.push({ operator: "NOS", title: "Ocorrência ativa — região de Leiria", description: text, start_date: null, end_date: null, affected_services: ["Vários serviços"], source_url: NOS_INCIDENTS_URL }); break; }
      }
    }
    return incidents;
  } catch { return []; }
}

async function scrapeVodafoneStatus() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(VODAFONE_STATUS_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)", Accept: "text/html" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    const incidents: { operator: string; title: string; description: string; start_date: string | null; end_date: string | null; affected_services: string[]; source_url: string }[] = [];
    const jsonDataPattern = /(?:window\.__INITIAL_STATE__|window\.__NUXT__|data-page="|:incidents="|v-bind:incidents=").*?(\[[\s\S]*?\])/i;
    const jsonMatch = html.match(jsonDataPattern);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (Array.isArray(data)) {
          for (const item of data) {
            const title = item.title ?? item.titulo ?? item.name ?? "";
            const desc = item.description ?? item.descricao ?? item.message ?? item.mensagem ?? "";
            if (title || desc) incidents.push({ operator: "Vodafone", title: stripHtml(title) || "Incidente Vodafone", description: stripHtml(desc), start_date: item.startDate ?? null, end_date: item.endDate ?? null, affected_services: [], source_url: VODAFONE_STATUS_URL });
          }
        }
      } catch { /* JSON parse failed */ }
    }
    if (incidents.length === 0) {
      const noIncidents = /[Ss]em\s+registo\s+de\s+ocorr[eê]ncias/i.test(html);
      if (!noIncidents) {
        const incidentPattern = /<(?:div|article|section)[^>]*class="[^"]*incident[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|section)>/gi;
        let match;
        while ((match = incidentPattern.exec(html)) !== null) {
          const content = stripHtml(match[1]);
          if (content.length > 20) incidents.push({ operator: "Vodafone", title: "Incidente Vodafone", description: content.substring(0, 300), start_date: null, end_date: null, affected_services: [], source_url: VODAFONE_STATUS_URL });
        }
      }
    }
    return incidents;
  } catch { return []; }
}

export async function fetchTelecomData() {
  const [operatorResults, meoAvailability, nosIncidents, vodafoneIncidents] = await Promise.all([
    Promise.all(OPERATOR_ENDPOINTS.map(checkEndpoint)),
    scrapeMeoAvailability(),
    scrapeNosIncidents(),
    scrapeVodafoneStatus(),
  ]);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    source: "Connectivity checks + MEO Disponibilidade + NOS Ocorrências + Vodafone Estado da Rede + ANACOM data",
    operators: operatorResults,
    operator_incidents: [...nosIncidents, ...vodafoneIncidents],
    meo_availability: meoAvailability,
    kristin_impact: {
      last_known_affected_clients: 147000,
      last_known_date: "2026-02-03",
      most_affected_operators: ["MEO", "Vodafone", "NOS"],
      most_affected_areas: ["Leiria", "Pombal", "Marinha Grande", "Porto de Mós", "Alcobaça"],
      note: "Dados da ANACOM a 03/02/2026. Para dados atualizados em tempo real, consultar https://www.anacom.pt",
      anacom_recommendations_url: ANACOM_KRISTIN_URL,
    },
    tips: {
      roaming_nacional: "A ANACOM recomendou roaming nacional temporário entre operadores",
      compensacao: "Interrupção > 24h = direito a compensação. > 15 dias = cancelamento sem custos",
      report: "Reportar falhas à operadora e usar o Livro de Reclamações",
    },
  };
}
