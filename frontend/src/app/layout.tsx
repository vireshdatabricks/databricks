import type { Metadata } from "next";
import "./globals.css";
import { enterpriseSans } from "./fonts";

export const metadata: Metadata = {
  title: "CMS Dashboard",
  description: "CMS Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={enterpriseSans.variable}>
        {children}
      </body>
    </html>
  );
}
