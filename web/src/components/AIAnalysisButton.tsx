import { useNavigate } from "react-router-dom";

interface Props {
  asset: string;
  dailyUsed?: number;
  dailyLimit?: number | null;
}

/** Botão fixo "O que está acontecendo?" — costura a narrativa da IA (PRD §8.3). */
export default function AIAnalysisButton({ asset, dailyUsed, dailyLimit }: Props) {
  const navigate = useNavigate();
  const counter =
    dailyLimit === null
      ? "ilimitado"
      : dailyLimit != null && dailyUsed != null
        ? `${dailyUsed} de ${dailyLimit} hoje`
        : null;

  return (
    <button
      onClick={() => navigate(`/analysis?asset=${asset}`)}
      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary/90"
    >
      ✨ O que está acontecendo?
      {counter && <span className="text-xs font-normal text-primary-foreground/80">({counter})</span>}
    </button>
  );
}
