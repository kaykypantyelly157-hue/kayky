import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "2K Gestão",
  description: "Gestão interna da 2K Celulares",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#020617"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
