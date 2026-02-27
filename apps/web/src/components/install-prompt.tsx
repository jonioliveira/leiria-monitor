"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or already installed (standalone mode)
    if (
      localStorage.getItem(DISMISSED_KEY) ||
      window.matchMedia("(display-mode: standalone)").matches
    ) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !prompt) return null;

  async function handleInstall() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
  }

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[2000] flex items-center gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-sm md:left-auto md:right-6 md:w-80">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Instalar Rede Sentinela</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Acesso rápido ao mapa e reportes</p>
      </div>
      <button
        onClick={handleInstall}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Download className="h-3.5 w-3.5" />
        Instalar
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dispensar"
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
