import { NextResponse } from "next/server";

const SMAS_WP_API =
  "https://smas-leiria.pt/wp-json/wp/v2/posts?categories=13,1&per_page=5&orderby=date&order=desc";

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

export async function GET() {
  try {
    // Fetch SMAS website check and WordPress announcements in parallel
    const [smasCheck, announcementsRes] = await Promise.allSettled([
      (async () => {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch("https://smas-leiria.pt", {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal,
          next: { revalidate: 0 },
        });
        clearTimeout(timeout);
        return { reachable: res.ok || res.status === 301 || res.status === 302, response_time_ms: Date.now() - start };
      })(),
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(SMAS_WP_API, {
          signal: controller.signal,
          next: { revalidate: 600 }, // 10 min cache
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const posts = await res.json();
        return (posts as any[]).map((p) => ({
          id: p.id,
          title: stripHtml(p.title?.rendered ?? ""),
          excerpt: stripHtml(p.excerpt?.rendered ?? ""),
          date: p.date,
          link: p.link,
        }));
      })(),
    ]);

    let smasReachable = false;
    let smasResponseTime: number | null = null;
    if (smasCheck.status === "fulfilled") {
      smasReachable = smasCheck.value.reachable;
      smasResponseTime = smasCheck.value.response_time_ms;
    }

    const announcements =
      announcementsRes.status === "fulfilled" ? announcementsRes.value : [];

    // Known Kristin water impact context
    const kristinContext = {
      note: "Após a tempestade Kristin, várias zonas de Leiria tiveram interrupções no abastecimento de água. A ERSAR emitiu recomendações sobre faturação para os concelhos em calamidade.",
      affected_areas: [
        "Zonas altas do concelho de Leiria",
        "Maceira",
        "Arrabal",
        "Parceiros",
        "Marrazes (parcialmente)",
      ],
      dgs_advisory:
        "A DGS recomenda não beber água de fontes não ligadas à rede pública e não lavar alimentos com essa água",
      ersar_advisory:
        "A ERSAR recomendou medidas excecionais na faturação de água nos concelhos em calamidade",
      last_updated: "2026-02-10",
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "SMAS de Leiria / ERSAR",
      note: "Dados de água não disponíveis via API pública. Este endpoint fornece contexto estruturado e verifica a disponibilidade do site do SMAS.",
      smas_website: {
        reachable: smasReachable,
        response_time_ms: smasResponseTime,
        url: "https://www.smas-leiria.pt",
      },
      announcements,
      kristin_impact: kristinContext,
      contacts: {
        smas_leiria: {
          phone: "244 839 400",
          emergency: "800 200 406",
          address: "Rua de São Domingos, 2410-156 Leiria",
        },
        ersar: {
          url: "https://www.ersar.pt",
        },
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
