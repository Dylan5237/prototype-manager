import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "伏羲项目协同原型",
  description: "建模开发平台的项目浏览与原型工作台双模式交互原型。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
