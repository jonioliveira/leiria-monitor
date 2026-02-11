import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leiria Monitor — Kristin Recovery Dashboard",
  description:
    "Monitorização em tempo real de eletricidade, água e comunicações no distrito de Leiria após a tempestade Kristin",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="noise-bg grid-pattern min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
