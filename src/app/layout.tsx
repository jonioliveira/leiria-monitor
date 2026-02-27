import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { OfflineBanner } from "@/components/offline-banner";
import { InstallPrompt } from "@/components/install-prompt";

export const metadata: Metadata = {
  title: "Rede Sentinela — Leiria",
  description:
    "Monitorização da recuperação de infraestruturas no distrito de Leiria após a tempestade Kristin",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Sentinela",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="flex min-h-screen flex-col antialiased">
        <OfflineBanner />
        <InstallPrompt />
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
          <div className="mx-auto max-w-7xl px-4">
            <p>
              Dados: E-REDES · IPMA · ANEPC · ANACOM · Copernicus EMS
            </p>
            <p className="mt-1">
              Desenvolvido por{" "}
              <a href="https://jonioliveira.com" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary transition-colors">
                jonioliveira.com
              </a>
            </p>
            <p className="mt-1">
              Made with ❤️ from Leiria
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
