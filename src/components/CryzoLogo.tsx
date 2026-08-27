"use client";

import { cn } from "@/lib/utils";

export function CryzoLogo({
  size = 28,
  showWordmark = false,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cryzo-gradient" x1="6" y1="5" x2="26" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B5CF6" />
            <stop offset="0.52" stopColor="#60A5FA" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="10" fill="#070A13" />
        <path
          d="M21.8 8.4A9.3 9.3 0 1 0 23.6 22l-4.4-3a4.2 4.2 0 1 1-1-6.7l3.6-3.9Z"
          fill="url(#cryzo-gradient)"
        />
        <path d="m20.3 13.1 4.5 2.9-4.5 2.9a5 5 0 0 0 0-5.8Z" fill="white" fillOpacity=".95" />
      </svg>
      {showWordmark && (
        <span className="text-base font-semibold tracking-tight text-current">Cryzo</span>
      )}
    </span>
  );
}
