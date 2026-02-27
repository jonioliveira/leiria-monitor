"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const DISMISSED_KEY = "push-notification-dismissed";

export function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    if (Notification.permission === "granted") {
      setSubscribed(true);
      return;
    }

    if (Notification.permission === "denied") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Small delay so it doesn't pop up immediately on page load
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);

  async function subscribe() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });

      // Try to get coordinates for geo-targeted notifications
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Coordinates are optional — fall back to global notifications
      }

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), lat, lng }),
      });

      setSubscribed(true);
      setVisible(false);
    } catch {
      // Ignore errors silently
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (subscribed) return null;
  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-white/10 bg-[#1a2744] p-4 shadow-xl sm:bottom-6">
      <button
        onClick={dismiss}
        className="absolute right-3 top-3 rounded p-0.5 text-white/40 hover:text-white/80"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
          <Bell className="h-4 w-4 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            Alertas de emergência
          </p>
          <p className="mt-0.5 text-xs text-white/60">
            Recebe notificações quando há problemas urgentes na tua área.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={subscribe}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {loading ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
              ) : (
                <Bell className="h-3 w-3" />
              )}
              Ativar alertas
            </button>
            <button
              onClick={dismiss}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:text-white"
            >
              <BellOff className="h-3 w-3" />
              Não, obrigado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
