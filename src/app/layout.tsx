import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import "./globals.css";
import "./lib/envSetup";

export const metadata: Metadata = {
  title: "Realtime API Agents",
  description: "A demo app from OpenAI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const incomingHeaders = await headers();
  const hostHeader =
    incomingHeaders.get("x-forwarded-host") ??
    incomingHeaders.get("host") ??
    "";
  const hostname = hostHeader.split(":")[0];
  const htmlStyle: (CSSProperties & { ["--vsc-domain"]?: string }) | undefined =
    hostname
      ? ({
          "--vsc-domain": JSON.stringify(hostname),
        } as CSSProperties & { ["--vsc-domain"]?: string })
      : undefined;

  return (
    <html lang="en" suppressHydrationWarning style={htmlStyle}>
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
