import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The AI Adoption Spiral",
  description: "Interactive yarn ball — inspired by Liz Fosslien",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, overflow: "hidden", position: "fixed", width: "100%", height: "100%" }}>{children}</body>
    </html>
  );
}
