import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
export const metadata: Metadata = {
  title: "SathRide — Go Together. Spend Less.",
  description: "Trusted communities and everyday carpools in Pakistan.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SathRide", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
