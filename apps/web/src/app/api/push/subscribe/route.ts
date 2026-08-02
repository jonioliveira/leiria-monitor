import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const revalidate = 0;

// POST — save or update a push subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, lat, lng } = body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      lat?: number;
      lng?: number;
    };

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json(
        { success: false, error: "Subscrição inválida" },
        { status: 400 }
      );
    }

    await db
      .insert(pushSubscriptions)
      .values({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        lat: lat ?? null,
        lng: lng ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          lat: lat ?? null,
          lng: lng ?? null,
        },
      });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE — remove a push subscription (user turned off notifications)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body as { endpoint: string };

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "endpoint obrigatório" },
        { status: 400 }
      );
    }

    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
