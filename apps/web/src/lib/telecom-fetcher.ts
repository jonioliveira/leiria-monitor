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
const MEO_SEARCH_API =
  "https://app-ef66ba3b-3a54-42d4-9559-560dd50c913d.apps.meo.pt/Services/Rest.svc/SearchStores";
const MEO_API_KEY = process.env.MEO_API_KEY ?? "177204608089cec963d39972af2b2df0d2fcc130d6";
// Bounding box covering the entire Leiria district including coastal Peniche
const MEO_LEIRIA_BBOX = { latitude1: 39.2, longitude1: -9.5, latitude2: 40.2, longitude2: -8.1 };
const MEO_AVAILABILITY_URL = "https://www.meo.pt/disponibilidade-servicos-meo";
const NOS_FORUM_URL =
  "https://forum.nos.pt/novidades-16/depressao-kristin-o-que-precisa-saber-51910";
const VODAFONE_KRISTIN_URL =
  "https://ajuda.vodafone.pt/perguntas-frequentes/calamidade-kristin-estado-de-recuperacao-de-servicos-por-concelho";
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

  // Fetch HTML page for last_updated date and global stats
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(MEO_APP_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)", Accept: "text/html" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) {
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
    }
  } catch { /* HTML fetch failed — non-critical */ }

  // Fetch per-concelho data via the SearchStores REST API using Leiria district bounding box
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(MEO_SEARCH_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "APIKey": MEO_API_KEY,
        "Referer": MEO_APP_URL,
        "Origin": "https://app-ef66ba3b-3a54-42d4-9559-560dd50c913d.apps.meo.pt",
        "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify(MEO_LEIRIA_BBOX),
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as { StatusCode: number; Result: { Name: string; Address: string; IsMunicipality: boolean; PercentLandline: string; DateLandline: string; PercentMobile: string; DateMobile: string }[] };
      if (data.StatusCode === 200 && Array.isArray(data.Result)) {
        const capitalize = (w: string) => {
          const lower = w.toLowerCase();
          if (["de", "do", "da", "dos", "das", "a", "e", "o", "em"].includes(lower)) return lower;
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        };
        for (const poi of data.Result) {
          // Only process Leiria district municipalities (Address is just "LEIRIA" for district entries)
          if (!poi.IsMunicipality || poi.Address.toUpperCase() !== "LEIRIA") continue;
          const rawName = poi.Name.replace(/\s*\(Concelho\)\s*/i, "").trim();
          const concelho = rawName.split(" ").map(capitalize).join(" ");
          const fixaPrevisao = poi.DateLandline?.includes("95%") ? "Disponibilidade >= 95%" : poi.DateLandline ?? "";
          const movelPrevisao = poi.DateMobile?.includes("95%") ? "Disponibilidade >= 95%" : poi.DateMobile ?? "";
          const parseApiPct = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
          const entry: MeoConcelhoEntry = {
            concelho,
            distrito: "Leiria",
            rede_fixa_pct: parseApiPct(poi.PercentLandline),
            rede_fixa_previsao: fixaPrevisao,
            rede_movel_pct: parseApiPct(poi.PercentMobile),
            rede_movel_previsao: movelPrevisao,
            is_leiria_district: true,
          };
          result.concelhos.push(entry);
          result.leiria_district.push(entry);
          if (rawName.toUpperCase() === "LEIRIA") result.leiria_concelho = entry;
        }
        result.success = result.concelhos.length > 0;
      }
    }
  } catch { /* API fetch failed */ }

  return result;
}

type NosConcelhoEntry = {
  concelho: string;
  distrito: string;
  rede_fixa_pct: number | null;
  rede_movel_pct: number | null;
  is_leiria_district: boolean;
};

async function scrapeNosAvailability() {
  const result: {
    success: boolean;
    concelhos: NosConcelhoEntry[];
    leiria_district: NosConcelhoEntry[];
    leiria_concelho: NosConcelhoEntry | null;
    source_url: string;
    fetched_at: string;
  } = {
    success: false,
    concelhos: [],
    leiria_district: [],
    leiria_concelho: null,
    source_url: NOS_FORUM_URL,
    fetched_at: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(NOS_FORUM_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)",
        Accept: "text/html",
      },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return result;

    const html = await res.text();

    // Locate the content-spoiler table
    const spoilerIdx = html.indexOf("content-spoiler");
    if (spoilerIdx === -1) return result;
    const tableStart = html.indexOf("<table", spoilerIdx);
    const tableEnd = html.indexOf("</table>", tableStart);
    if (tableStart === -1 || tableEnd === -1) return result;
    const tableHtml = html.slice(tableStart, tableEnd + "</table>".length);

    // Parse rows — district-first rows have 4 <td>s (district+rowspan, concelho, fixa%, movel%)
    // continuation rows have 3 <td>s (concelho, fixa%, movel%)
    let currentDistrito = "";
    for (const row of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowContent = row[1];
      if (/<th/i.test(rowContent)) continue; // skip header row

      const cells = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        stripHtml(m[1]).trim()
      );

      if (cells.length === 4) {
        currentDistrito = cells[0];
        const entry: NosConcelhoEntry = {
          distrito: currentDistrito,
          concelho: cells[1],
          rede_fixa_pct: parsePercentage(cells[2]),
          rede_movel_pct: parsePercentage(cells[3]),
          is_leiria_district: currentDistrito.toLowerCase() === "leiria",
        };
        result.concelhos.push(entry);
        if (entry.is_leiria_district) result.leiria_district.push(entry);
        if (entry.is_leiria_district && entry.concelho.toLowerCase() === "leiria") {
          result.leiria_concelho = entry;
        }
      } else if (cells.length === 3 && currentDistrito) {
        const entry: NosConcelhoEntry = {
          distrito: currentDistrito,
          concelho: cells[0],
          rede_fixa_pct: parsePercentage(cells[1]),
          rede_movel_pct: parsePercentage(cells[2]),
          is_leiria_district: currentDistrito.toLowerCase() === "leiria",
        };
        result.concelhos.push(entry);
        if (entry.is_leiria_district) result.leiria_district.push(entry);
        if (entry.is_leiria_district && entry.concelho.toLowerCase() === "leiria") {
          result.leiria_concelho = entry;
        }
      }
    }

    result.success = result.concelhos.length > 0;
  } catch { /* scrape failed */ }

  return result;
}

type VodafoneConcelhoEntry = {
  concelho: string;
  distrito: string;
  rede_fixa_pct: number | null;
  rede_fixa_previsao: string;
  rede_movel_pct: number | null;
  rede_movel_previsao: string;
  is_leiria_district: boolean;
};

async function scrapeVodafoneAvailability() {
  const result: {
    success: boolean;
    concelhos: VodafoneConcelhoEntry[];
    leiria_district: VodafoneConcelhoEntry[];
    leiria_concelho: VodafoneConcelhoEntry | null;
    source_url: string;
    fetched_at: string;
  } = {
    success: false,
    concelhos: [],
    leiria_district: [],
    leiria_concelho: null,
    source_url: VODAFONE_KRISTIN_URL,
    fetched_at: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(VODAFONE_KRISTIN_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)",
        Accept: "text/html",
      },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return result;

    const html = await res.text();

    const tableStart = html.indexOf("<table");
    const tableEnd = html.indexOf("</table>", tableStart);
    if (tableStart === -1 || tableEnd === -1) return result;
    const tableHtml = html.slice(tableStart, tableEnd + "</table>".length);

    // Rows: 6 cells = district-first [district, concelho, fixa_pct, fixa_previsao, movel_pct, movel_previsao]
    //       5 cells = continuation   [concelho, fixa_pct, fixa_previsao, movel_pct, movel_previsao]
    let currentDistrito = "";
    for (const row of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowContent = row[1];
      if (/<th/i.test(rowContent)) continue; // skip header rows

      const cells = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        stripHtml(m[1]).trim()
      );

      let concelho: string, fixa_pct: number | null, fixa_previsao: string,
          movel_pct: number | null, movel_previsao: string;

      if (cells.length === 6) {
        currentDistrito = cells[0];
        concelho = cells[1];
        fixa_pct = parsePercentage(cells[2]);
        fixa_previsao = cells[3];
        movel_pct = parsePercentage(cells[4]);
        movel_previsao = cells[5];
      } else if (cells.length === 5 && currentDistrito) {
        concelho = cells[0];
        fixa_pct = parsePercentage(cells[1]);
        fixa_previsao = cells[2];
        movel_pct = parsePercentage(cells[3]);
        movel_previsao = cells[4];
      } else {
        continue; // header sub-row or unknown shape
      }

      if (!concelho) continue;
      const entry: VodafoneConcelhoEntry = {
        distrito: currentDistrito,
        concelho,
        rede_fixa_pct: fixa_pct,
        rede_fixa_previsao: fixa_previsao,
        rede_movel_pct: movel_pct,
        rede_movel_previsao: movel_previsao,
        is_leiria_district: currentDistrito.toLowerCase() === "leiria",
      };
      result.concelhos.push(entry);
      if (entry.is_leiria_district) result.leiria_district.push(entry);
      if (entry.is_leiria_district && entry.concelho.toLowerCase() === "leiria") {
        result.leiria_concelho = entry;
      }
    }

    result.success = result.concelhos.length > 0;
  } catch { /* scrape failed */ }

  return result;
}

export async function fetchTelecomData() {
  const [operatorResults, meoAvailability, nosAvailability, vodafoneAvailability] = await Promise.all([
    Promise.all(OPERATOR_ENDPOINTS.map(checkEndpoint)),
    scrapeMeoAvailability(),
    scrapeNosAvailability(),
    scrapeVodafoneAvailability(),
  ]);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    source: "Connectivity checks + MEO Disponibilidade + NOS Forum Kristin + Vodafone Ajuda Kristin + ANACOM data",
    operators: operatorResults,
    operator_incidents: [],
    meo_availability: meoAvailability,
    nos_availability: nosAvailability,
    vodafone_availability: vodafoneAvailability,
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
