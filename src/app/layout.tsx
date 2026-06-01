import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/toast";
import { SettingsProvider } from "@/lib/settings/context";
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
          <ToastProvider>
            <LayoutShell>
              <Sidebar />
              <main className="min-w-0 flex-1 px-8 py-6">
                <div className="mx-auto max-w-7xl">{children}</div>
              </main>
            </LayoutShell>
          </ToastProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
