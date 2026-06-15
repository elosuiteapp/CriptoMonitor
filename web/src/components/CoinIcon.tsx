import { useState } from "react";

// Cor de marca por moeda (fallback quando o logo não carrega).
const BRAND: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", SOL: "#14f195", BNB: "#f3ba2f",
  XRP: "#23292f", DOGE: "#c2a633", ADA: "#0033ad", AVAX: "#e84142",
  LINK: "#2a5ada", SUI: "#4da2ff", TON: "#0098ea", POL: "#8247e5",
  DOT: "#e6007a", LTC: "#345d9d",
};

/** Logo da moeda (CoinCap CDN). Se o logo não existir, mostra um selo colorido
 *  com a inicial — nunca quebra a UI. */
export default function CoinIcon({ asset, size = 18 }: { asset: string; size?: number }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span
        className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white"
        style={{ width: size, height: size, background: BRAND[asset] ?? "#475569", fontSize: size * 0.42 }}
        aria-hidden
      >
        {asset.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={`https://assets.coincap.io/assets/icons/${asset.toLowerCase()}@2x.png`}
      onError={() => setBroken(true)}
      width={size}
      height={size}
      alt={asset}
      loading="lazy"
      className="shrink-0 rounded-full"
    />
  );
}
