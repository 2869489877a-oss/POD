import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/toast";
import { SettingsProvider } from "@/lib/settings/context";
import { AuthProvider } from "@/lib/auth/context";
import { LayoutShell } from "@/components/layout-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "POD 商品图批量处理系统",
  description: "内部使用的 POD 商品图批量处理系统",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
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
