/** Original brand art: two speech bubbles colliding, and a marquee plate for the full version. */
import { useId } from "react";
import { PRODUCT_NAME } from "../../lib/brand";

const BUBBLE = "M18 10h26a14 14 0 0 1 14 14v12a14 14 0 0 1-14 14H30L15 63l3-13.2A14 14 0 0 1 4 36V24a14 14 0 0 1 14-14z";
const SPARK = "M60 8l4.4 15.4L78 15l-7.6 13.8L86 33l-15.4 4.4L78 52l-13.6-8.2L60 60l-4.4-16.2L42 52l7.4-14.6L34 33l15.6-4.2L42 15l13.6 8.4z";

function Mark({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#f5b301" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f78f0" />
          <stop offset="1" stopColor="#2554c7" />
        </linearGradient>
      </defs>
      <path d={BUBBLE} fill="#a67700" transform="translate(0 3)" />
      <path d={BUBBLE} fill={`url(#${id}g)`} />
      <g transform="translate(120 0) scale(-1 1)">
        <path d={BUBBLE} fill="#14306f" transform="translate(0 3)" />
        <path d={BUBBLE} fill={`url(#${id}b)`} />
      </g>
      <path d={SPARK} fill="#fff" stroke="#c81e35" strokeWidth="2.5" strokeLinejoin="round" />
    </>
  );
}

const BULBS_X = Array.from({ length: 15 }, (_, i) => 26 + i * 22);

interface Props {
  variant?: "mark" | "full";
  className?: string;
}

export function Wordmark({ variant = "mark", className }: Props) {
  const id = useId().replace(/:/g, "");
  if (variant === "mark") {
    return (
      <svg className={`sx-mark${className ? ` ${className}` : ""}`} viewBox="0 0 120 68" role="img" aria-label={PRODUCT_NAME}>
        <Mark id={id} />
      </svg>
    );
  }
  return (
    <svg className={`sx-wordmark${className ? ` ${className}` : ""}`} viewBox="0 0 360 176" role="img" aria-label={PRODUCT_NAME}>
      <g transform="translate(120 0)">
        <Mark id={id} />
      </g>
      <g transform="translate(14 0) skewX(-6)">
        <rect x="8" y="64" width="344" height="104" rx="16" fill="#a67700" transform="translate(0 4)" />
        <rect x="8" y="64" width="344" height="104" rx="16" fill={`url(#${id}g)`} />
        <rect x="24" y="80" width="312" height="72" rx="8" fill="#071444" />
        {BULBS_X.map((x) => (
          <g key={x} fill="#fff6d8">
            <circle cx={x} cy="72" r="3.5" />
            <circle cx={x} cy="160" r="3.5" />
          </g>
        ))}
        <text x="180" y="138" textAnchor="middle" textLength="284" lengthAdjust="spacingAndGlyphs" fontFamily="Anton, Impact, 'Arial Narrow', sans-serif" fontSize="52" fill="#ffd34d">
          {PRODUCT_NAME.toUpperCase()}
        </text>
      </g>
    </svg>
  );
}
