import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIGEP PROJETARQ", template: "%s · SIGEP PROJETARQ" },
  description: "Sistema Integrado de Gestão de Projetos, Engenharia e Arquitetura",
  robots: { index: false, follow: false },
};

// Nada é pré-renderizado no build: toda página depende do banco e da sessão do usuário.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1c2e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
