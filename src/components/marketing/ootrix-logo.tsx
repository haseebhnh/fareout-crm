/**
 * OOTRIX mark — the interlocked "OO" with the diagonal stroke.
 *
 * Drawn as SVG rather than shipped as a raster so it stays crisp at
 * favicon size and on a hero, and so the two brand blues and the gold
 * accent come from one place. Per the brand rules this is the only
 * logo used anywhere in the product.
 *
 * Semantics: `title` makes it an accessible image by default. Pass
 * `decorative` where the wordmark sits next to it and would otherwise
 * be announced twice.
 */
export function OotrixMark({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 64"
      fill="none"
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "OOTRIX"}
    >
      <defs>
        <linearGradient id="oo-loop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E90FF" />
          <stop offset="55%" stopColor="#0A2F9C" />
          <stop offset="100%" stopColor="#081B4B" />
        </linearGradient>
      </defs>

      {/* The infinity loop — two O's sharing a crossing, for
          "connection & continuity" per the brand sheet. */}
      <path
        d="M34 32c0-11 -8-18 -17-18S2 21 2 32s6 18 15 18 17-7 17-18Zm0 0c0 11 8 18 17 18s15-7 15-18-6-18-15-18-17 7-17 18Z"
        stroke="url(#oo-loop)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* Diagonal stroke — speed and forward movement. */}
      <path
        d="M74 50 106 14"
        stroke="#0A2F9C"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* Gold cap — success and premium quality. */}
      <path
        d="M96 14h14l-9 10Z"
        fill="#FFC107"
      />
    </svg>
  );
}

/** Mark plus wordmark, for the nav and footer. */
export function OotrixLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <OotrixMark className="h-7 w-auto" decorative />
      <span
        className="text-[19px] font-bold tracking-[0.18em]"
        style={{ color: "var(--oo-ink)" }}
      >
        OOTRIX
      </span>
    </span>
  );
}
