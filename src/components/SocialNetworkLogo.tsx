"use client";

import type { SVGProps } from "react";

export type SocialNetwork = "x" | "twitter" | "facebook" | "instagram" | "youtube" | "linkedin" | "reddit" | "tiktok";

export function SocialNetworkLogo({
  channel,
  size = 18,
  className,
  title,
}: {
  channel: SocialNetwork;
  size?: number;
  className?: string;
  title?: string;
}) {
  const common: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    role: title ? "img" : "presentation",
    "aria-hidden": title ? undefined : true,
  };
  const label = title ? <title>{title}</title> : null;

  if (channel === "x" || channel === "twitter") {
    return <svg {...common} fill="currentColor">{label}<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg>;
  }
  if (channel === "facebook") {
    return <svg {...common} fill="currentColor">{label}<path d="M13.5 22v-8.2h2.75l.41-3.2H13.5V8.56c0-.93.26-1.56 1.59-1.56h1.7V4.14A22.8 22.8 0 0 0 14.31 4c-2.45 0-4.13 1.5-4.13 4.25v2.35H7.4v3.2h2.78V22h3.32Z"/></svg>;
  }
  if (channel === "instagram") {
    return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">{label}<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.7" r="1.15" fill="currentColor" stroke="none"/></svg>;
  }
  if (channel === "youtube") {
    return <svg {...common} fill="currentColor">{label}<path d="M23.5 6.2a3.1 3.1 0 0 0-2.18-2.2C19.4 3.5 12 3.5 12 3.5s-7.4 0-9.32.5A3.1 3.1 0 0 0 .5 6.2 32.8 32.8 0 0 0 0 12a32.8 32.8 0 0 0 .5 5.8A3.1 3.1 0 0 0 2.68 20c1.92.5 9.32.5 9.32.5s7.4 0 9.32-.5a3.1 3.1 0 0 0 2.18-2.2A32.8 32.8 0 0 0 24 12a32.8 32.8 0 0 0-.5-5.8ZM9.6 15.65v-7.3L15.82 12 9.6 15.65Z"/></svg>;
  }
  if (channel === "linkedin") {
    return <svg {...common} fill="currentColor">{label}<path d="M5.34 7.1H1.72V22h3.62V7.1ZM3.53 2A2.1 2.1 0 1 0 3.5 6.2 2.1 2.1 0 0 0 3.53 2ZM22 13.46c0-4.49-2.4-6.58-5.6-6.58-2.58 0-3.74 1.42-4.38 2.42V7.1H8.4V22h3.62v-7.38c0-1.95.37-3.85 2.8-3.85 2.4 0 2.43 2.24 2.43 3.98V22H22v-8.54Z"/></svg>;
  }
  if (channel === "reddit") {
    return <svg {...common} fill="currentColor">{label}<path d="M20.6 12.1c.08-.35.12-.72.12-1.1a2.5 2.5 0 0 0-4.28-1.76 11.7 11.7 0 0 0-3.77-1.16l.77-3.63 2.52.54a1.8 1.8 0 1 0 .27-1.25l-3.15-.67a.64.64 0 0 0-.76.5l-.95 4.45a11.7 11.7 0 0 0-3.82 1.18A2.5 2.5 0 0 0 3.28 11c0 .38.04.75.12 1.1C1.9 13.15 1 14.55 1 16.08 1 19.35 5.93 22 12 22s11-2.65 11-5.92c0-1.53-.9-2.93-2.4-3.98ZM7.9 14.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Zm7.75 4.95c-1.03 1.03-2.55 1.55-3.65 1.55s-2.62-.52-3.65-1.55a.62.62 0 1 1 .88-.88c.77.77 1.98 1.18 2.77 1.18s2-.41 2.77-1.18a.62.62 0 1 1 .88.88Zm.45-1.75a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2Z"/></svg>;
  }
  return <svg {...common} fill="currentColor">{label}<path d="M15.5 2c.25 2.1 1.42 3.46 3.5 3.6v3.1a7.1 7.1 0 0 1-3.47-.82v6.3a6.18 6.18 0 1 1-5.34-6.12v3.2a3.08 3.08 0 1 0 2.15 2.94V2h3.16Z"/></svg>;
}
