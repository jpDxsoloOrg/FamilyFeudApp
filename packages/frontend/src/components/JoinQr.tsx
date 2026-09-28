// Task 5.5 — QR code that opens the join screen with the code prefilled.
import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface Props {
  joinCode: string;
  size?: number;
}

/** URL a phone lands on when it scans the code: the join screen with the code prefilled. */
export function joinUrl(joinCode: string): string {
  return `${window.location.origin}/?code=${encodeURIComponent(joinCode)}`;
}

export function JoinQr({ joinCode, size = 220 }: Props) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl(joinCode), { width: size, margin: 1, color: { dark: "#0b1d51", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => setSrc(undefined));
    return () => {
      cancelled = true;
    };
  }, [joinCode, size]);
  if (!src) return null;
  return <img className="qr" src={src} width={size} height={size} alt={`QR code to join with code ${joinCode}`} />;
}
