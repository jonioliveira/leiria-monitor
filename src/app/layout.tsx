import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Rede Sentinela — Leiria",
  description:
    "Monitorização da recuperação de infraestruturas no distrito de Leiria após a tempestade Kristin",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
