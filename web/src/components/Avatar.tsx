import { useState } from "react";

interface Props {
  url: string | null;
  name: string;
  size?: number;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Avatar do usuário: foto do OAuth quando existir, senão iniciais. */
export default function Avatar({ url, name, size = 32 }: Props) {
  const [broken, setBroken] = useState(false);
  const dim = { width: size, height: size };

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={dim}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary"
      style={{ ...dim, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}
