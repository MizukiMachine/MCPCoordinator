import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import "./globals.css";
import "./lib/envSetup";
import { uiText } from "./i18n";

export const metadata: Metadata = {
  title: uiText.metadata.title,
  description: uiText.metadata.description,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const bffKey =
    process.env.NEXT_PUBLIC_BFF_KEY ?? process.env.BFF_SERVICE_SHARED_SECRET ?? '';
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
    <html
      lang={uiText.metadata.lang}
      suppressHydrationWarning
      style={htmlStyle}
    >
      <body className={`antialiased`}>
        {bffKey ? (
          <script
            id="mcpc-bff-key"
            dangerouslySetInnerHTML={{
              __html: `window.__MCPC_BFF_KEY=${JSON.stringify(bffKey)};`,
            }}
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
