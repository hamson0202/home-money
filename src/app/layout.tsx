import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "世貿龍庭管理費對帳表",
  description: "輸入帳號末五碼，快速統計住戶管理費繳費狀況",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
          {children}
        </main>
      </body>
    </html>
  );
}
