// Bandeiras em SVG (emoji de bandeira não renderiza no Windows/Chrome → vira "BR"/"US").
// viewBox 28×20; o container externo arredonda e corta (overflow-hidden).

export function FlagBR({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="28" height="20" fill="#1F8A3B" />
      <path d="M14 2.4 L25.6 10 L14 17.6 L2.4 10 Z" fill="#FCD116" />
      <circle cx="14" cy="10" r="3.8" fill="#0A2C8B" />
    </svg>
  );
}

export function FlagUS({ className = "" }: { className?: string }) {
  const sh = 20 / 13; // altura de cada faixa
  const stripes = Array.from({ length: 13 }, (_, i) => (
    <rect key={i} y={sh * i} width="28" height={sh} fill={i % 2 === 0 ? "#B22234" : "#fff"} />
  ));
  const stars: React.ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      stars.push(<circle key={`${r}-${c}`} cx={1.7 + c * 2.6} cy={1.9 + r * 2.7} r="0.62" fill="#fff" />);
    }
  }
  return (
    <svg viewBox="0 0 28 20" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {stripes}
      <rect width="12" height={sh * 7} fill="#3C3B6E" />
      {stars}
    </svg>
  );
}
