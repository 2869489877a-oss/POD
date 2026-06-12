import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import { ToastProvider } from "@/components/toast";
import { SettingsProvider } from "@/lib/settings/context";
import { AuthProvider } from "@/lib/auth/context";
import { LayoutShell } from "@/components/layout-shell";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "POD 商品图批量处理系统",
  description: "内部使用的 POD 商品图批量处理系统",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
        <SettingsProvider>
          <AuthProvider>
            <ToastProvider>
              <LayoutShell>
                {children}
              </LayoutShell>
            </ToastProvider>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
