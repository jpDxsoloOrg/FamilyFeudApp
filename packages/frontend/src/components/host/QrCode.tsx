import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface Props {
  value: string;
  label: string;
  size?: number;
}

export function QrCode({ value, label, size = 160 }: Props) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#0b1d51", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => setSrc(undefined));
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  if (!src) return null;
  return <img className="qr" src={src} width={size} height={size} alt={label} />;
}
