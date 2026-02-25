import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Face Motion Parser",
  description: "Upload face tracking txt files and extract movement metrics."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
