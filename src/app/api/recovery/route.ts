import { NextResponse } from "next/server";

export const runtime = "edge";

// Platforms to monitor
const PLATFORMS = [
  {
    id: "estragos",
    name: "Estragos.pt",
    description: "Registo de danos — habitações e empresas",
    url: "https://estragos.pt",
    entity: "Câmara Municipal de Leiria",
  },
  {
    id: "ccdrc",
    name: "CCDR Centro — Tempestades 2026",
    description: "Candidaturas a apoios até 10.000€",
    url: "https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/",
    entity: "CCDR Centro",
  },
  {
    id: "bpf",
    name: "Banco de Fomento — Linhas de Crédito",
    description: "Linhas de crédito de emergência para empresas",
    url: "https://www.bfrm.pt",
    entity: "Banco Português de Fomento",
  },
  {
    id: "pepac",
    name: "PEPAC — Apoio Agrícola",
    description: "Apoio ao restabelecimento do potencial produtivo",
    url: "https://www.pepac.gov.pt",
    entity: "Ministério da Agricultura e Mar",
  },
  {
    id: "cm_leiria",
    name: "Câmara Municipal de Leiria",
    description: "Informação municipal sobre a recuperação",
    url: "https://www.cm-leiria.pt",
    entity: "Município de Leiria",
  },
];

// Structured support information
const SUPPORT_AREAS = [
  {
    id: "habitacao",
    title: "Habitação — Particulares",
    icon: "🏠",
    supports: [
      {
        name: "Apoio simplificado até 10.000€",
        description:
          "Escalão 1: até 5.000€ | Escalão 2: de 5.000€ a 10.000€. Comparticipação 100%.",
        platform: "CCDR Centro",
        url: "https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/",
        docs_required: [
          "Cartão de Cidadão",
          "IBAN",
          "Fotos dos danos",
          "Orçamentos de reparação",
          "Documentos do imóvel",
        ],
      },
      {
        name: "Moratória crédito habitação",
        description:
          "Suspensão de prestações bancárias por 90 dias (desde 28 Jan 2026). Regime seletivo de 12 meses para danos mais graves.",
        platform: "Banco de Portugal / APB",
        url: null,
        docs_required: [],
      },
      {
        name: "Apoio jurídico (sinistros e seguros)",
        description:
          "Advogados voluntários no Gabinete Reerguer Leiria para participações de sinistros e orientação jurídica.",
        platform: "Gabinete Reerguer Leiria",
        url: null,
        docs_required: ["Apólice de seguro", "Fotos dos danos"],
      },
    ],
  },
  {
    id: "empresas",
    title: "Empresas e Comércio",
    icon: "🏢",
    supports: [
      {
        name: "Linha de crédito tesouraria — 500M€",
        description:
          "Maturidade 5 anos, carência 12 meses. Via Banco de Fomento.",
        platform: "Banco Português de Fomento",
        url: "https://www.bfrm.pt",
        docs_required: [],
      },
      {
        name: "Linha de crédito investimento — 1.000M€",
        description:
          "Para reconstrução de instalações e equipamentos. Via Banco de Fomento.",
        platform: "Banco Português de Fomento",
        url: "https://www.bfrm.pt",
        docs_required: [],
      },
      {
        name: "Moratória créditos empresariais",
        description: "Suspensão de prestações por 90 dias desde 28 Jan 2026.",
        platform: "Banco de Portugal / APB",
        url: null,
        docs_required: [],
      },
      {
        name: "Registo de prejuízos empresariais",
        description:
          "Levantamento de danos via plataforma Estragos.pt da CM Leiria.",
        platform: "Estragos.pt",
        url: "https://estragos.pt",
        docs_required: [],
      },
    ],
  },
  {
    id: "agricultura",
    title: "Agricultura",
    icon: "🌾",
    supports: [
      {
        name: "Apoio não reembolsável — 40M€",
        description:
          "Restabelecimento do potencial produtivo. Candidaturas via portal PEPAC. Despesas elegíveis desde 28 Jan 2026.",
        platform: "PEPAC / Min. Agricultura",
        url: "https://www.pepac.gov.pt",
        docs_required: ["Declaração de prejuízos agrícolas"],
      },
    ],
  },
  {
    id: "ipss",
    title: "IPSS e Coletividades",
    icon: "🤝",
    supports: [
      {
        name: "Apoio à retoma de atividade",
        description:
          "Encaminhamento e apoio no Gabinete Reerguer Leiria. Articulação com Segurança Social.",
        platform: "Gabinete Reerguer Leiria",
        url: null,
        docs_required: [],
      },
    ],
  },
];

const GABINETE_INFO = {
  name: "Gabinete Reerguer Leiria",
  location: "Mercado de Sant'Ana, Leiria",
  coordinates: { lat: 39.7437, lng: -8.807 },
  schedule: "09:00 — 18:00 (dias úteis)",
  opened: "2026-02-10",
  num_counters: 15,
  areas: [
    "Apoio habitação (particulares)",
    "Apoio empresas e comércio",
    "IPSS e coletividades",
    "Segurança Social",
    "Autoridade Tributária",
    "Balcão Único — Câmara Municipal",
  ],
  email: "reerguerleiria@cm-leiria.pt",
  note: "Sistema de senhas para atendimento. Advogados disponíveis para participações de sinistros.",
  first_day_visitors: 250,
};

const CALAMITY_INFO = {
  status: "Situação de calamidade",
  extended_until: "2026-02-15",
  municipalities_count: 68,
  total_package: "2.500.000.000€",
  deaths_total: 15,
  storms: ["Kristin", "Leonardo", "Marta"],
  structure_mission: {
    name: "Estrutura de Missão para Reconstrução da Região Centro",
    coordinator: "Eng.º Paulo Fernandes",
    hq: "Leiria",
    started: "2026-02-02",
  },
};

async function checkPlatform(
  platform: (typeof PLATFORMS)[0]
): Promise<{
  id: string;
  name: string;
  description: string;
  url: string;
  entity: string;
  reachable: boolean;
  response_time_ms: number | null;
  checked_at: string;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(platform.url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      next: { revalidate: 0 },
    });
    clearTimeout(timeout);

    return {
      ...platform,
      reachable: res.ok || res.status < 500,
      response_time_ms: Date.now() - start,
      checked_at: new Date().toISOString(),
    };
  } catch {
    return {
      ...platform,
      reachable: false,
      response_time_ms: null,
      checked_at: new Date().toISOString(),
    };
  }
}

// Attempt to scrape CCDR-C page for updates
async function fetchCCDRCUpdates(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      "https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/",
      { signal: controller.signal, next: { revalidate: 1800 } }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();
    // Extract last modified or any date info from page
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Health check all platforms in parallel
    const platformResults = await Promise.all(
      PLATFORMS.map((p) => checkPlatform(p))
    );

    // Try to get CCDR-C page title for freshness check
    const ccdrTitle = await fetchCCDRCUpdates();

    const platformsOnline = platformResults.filter((p) => p.reachable).length;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),

      // Overall recovery status
      summary: {
        platforms_online: platformsOnline,
        platforms_total: platformResults.length,
        calamity_status: CALAMITY_INFO.status,
        calamity_until: CALAMITY_INFO.extended_until,
        municipalities_affected: CALAMITY_INFO.municipalities_count,
        total_support_package: CALAMITY_INFO.total_package,
      },

      // Gabinete info
      gabinete: GABINETE_INFO,

      // Platform health
      platforms: platformResults,

      // Structured support areas
      support_areas: SUPPORT_AREAS,

      // Calamity context
      calamity: CALAMITY_INFO,

      // CCDR-C page scrape
      ccdrc_page_title: ccdrTitle,

      // Useful links
      links: {
        estragos: "https://estragos.pt",
        ccdrc_apoios:
          "https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/",
        banco_fomento: "https://www.bfrm.pt",
        pepac: "https://www.pepac.gov.pt",
        cm_leiria: "https://www.cm-leiria.pt",
        email_doacoes: "reerguerleiria@cm-leiria.pt",
        ccdr_lvt:
          "https://www.ccdr-lvt.pt/2026/02/ccdr-lvt-disponibiliza-plataformas-de-apoio-as-pessoas-afetadas-pelas-calamidades-de-2026/",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
