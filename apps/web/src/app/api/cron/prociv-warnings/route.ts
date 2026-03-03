import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { procivWarnings } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";

const ANEPC_WARNINGS_URL =
  "https://www.prociv.gov.pt/pt/home/avisos-a-populacao/";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(ANEPC_WARNINGS_URL, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `ANEPC responded ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();

    // Extract warnings from the modal section
    // Pattern: <p class="titulo">Aviso à População</p> ... <p class="resumo">TEXT</p> ... <a ... href="URL">
    const warnings: { title: string; summary: string; detailUrl: string | null }[] = [];

    // Match the modal warning block
    const modalRegex =
      /<p\s+class="titulo">(.*?)<\/p>\s*<p\s+class="titulo-informativo">.*?<\/p>\s*<p\s+class="resumo">(.*?)<\/p>[\s\S]*?<a[^>]+href="([^"]*)"[^>]*>Saiba mais<\/a>/g;
    let match;
    while ((match = modalRegex.exec(html)) !== null) {
      const title = decodeHtmlEntities(match[1].trim());
      const summary = decodeHtmlEntities(match[2].trim());
      const detailUrl = match[3] || null;
      if (title && summary) {
        warnings.push({ title, summary, detailUrl });
      }
    }

    // Also try banner pattern as fallback
    if (warnings.length === 0) {
      const bannerRegex =
        /<p\s+class="titulo-emergencia">(.*?)<\/p>[\s\S]*?<a[^>]+class="button-alerta"[^>]+href="([^"]*)"[^>]*>/g;
      while ((match = bannerRegex.exec(html)) !== null) {
        const rawTitle = decodeHtmlEntities(match[1].trim());
        if (rawTitle && !rawTitle.includes("&nbsp;")) {
          warnings.push({
            title: rawTitle,
            summary: rawTitle,
            detailUrl: match[2] || null,
          });
        }
      }
    }

    // Replace all existing warnings with fresh data
    await db.delete(procivWarnings);

    let ingested = 0;
    for (const w of warnings) {
      await db.insert(procivWarnings).values({
        title: w.title,
        summary: w.summary,
        detailUrl: w.detailUrl
          ? `https://www.prociv.gov.pt${w.detailUrl}`
          : null,
        fetchedAt: new Date(),
      });
      ingested++;
    }

    return NextResponse.json({
      success: true,
      ingested,
      warnings: warnings.map((w) => ({
        title: w.title,
        summary: w.summary.slice(0, 100) + (w.summary.length > 100 ? "..." : ""),
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#xE0;/g, "à")
    .replace(/&#xE7;/g, "ç")
    .replace(/&#xE3;/g, "ã")
    .replace(/&#xE9;/g, "é")
    .replace(/&#xEA;/g, "ê")
    .replace(/&#xED;/g, "í")
    .replace(/&#xF3;/g, "ó")
    .replace(/&#xF4;/g, "ô")
    .replace(/&#xFA;/g, "ú")
    .replace(/&#xA;/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}
