import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  return NextResponse.json({
    success: true,
    detail: { skipped: true, reason: "Recovery score temporarily disabled — needs rethinking" },
    timestamp: new Date().toISOString(),
  });
}
