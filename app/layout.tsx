import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DojoProvider } from "@/lib/dojo/store";
import { BackStackProvider } from "@/lib/dojo/backstack";
import DojoShell from "./components/DojoShell";
import "./globals.css";
import "./dojo.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "行光道場｜Lumen Dojo",
  description: "全零的深耕聚光系統 — 行光道場 Lumen Dojo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <DojoProvider>
          <BackStackProvider>
            <DojoShell>{children}</DojoShell>
          </BackStackProvider>
        </DojoProvider>
      </body>
    </html>
  );
}
