import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The AI Adoption Spiral",
  description: "Interactive yarn ball — inspired by Liz Fosslien",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
