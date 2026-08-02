"use client";

import { useEffect, useState } from "react";
import { flushQueue, getQueuedCount } from "@/lib/report-queue";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    setQueued(getQueuedCount());

    async function handleOnline() {
      setOffline(false);
      const count = getQueuedCount();
      if (count > 0) {
        setFlushing(true);
        await flushQueue();
        setQueued(0);
        setFlushing(false);
      }
    }

    function handleOffline() {
      setOffline(true);
      setQueued(getQueuedCount());
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (flushing) {
    return (
      <div className="bg-blue-600 text-white text-center text-sm py-1.5 px-4 font-medium">
        A enviar reportes guardados…
      </div>
    );
  }

  if (!offline) return null;

  return (
    <div className="bg-amber-600 text-white text-center text-sm py-1.5 px-4 font-medium">
      Sem ligação — a mostrar dados em cache
      {queued > 0 && (
        <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
          {queued} {queued === 1 ? "reporte guardado" : "reportes guardados"}
        </span>
      )}
    </div>
  );
}
