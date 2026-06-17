// Paddle Billing (USD, público internacional). Carrega o Paddle.js sob demanda e
// abre o checkout overlay. Ativa quando VITE_PADDLE_TOKEN (e os price ids dos
// planos em plans.paddle_price_id) estiverem configurados — até lá fica inerte.
/* eslint-disable @typescript-eslint/no-explicit-any */
const TOKEN = import.meta.env.VITE_PADDLE_TOKEN as string | undefined;
const ENV = (import.meta.env.VITE_PADDLE_ENV as string | undefined) ?? "production";

let loader: Promise<any> | null = null;

function loadPaddle(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  if ((window as any).Paddle) return Promise.resolve((window as any).Paddle);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload = () => {
      const P = (window as any).Paddle;
      if (!P) return reject(new Error("Paddle não carregou"));
      resolve(P);
    };
    s.onerror = () => reject(new Error("falha ao carregar Paddle.js"));
    document.head.appendChild(s);
  });
  return loader;
}

export const paddleConfigured = (): boolean => Boolean(TOKEN);

export async function openPaddleCheckout(opts: { priceId: string; email?: string | null; userId: string }) {
  if (!TOKEN) throw new Error("Paddle ainda não configurado");
  if (!opts.priceId) throw new Error("priceId do plano ausente");
  const P = await loadPaddle();
  if (ENV === "sandbox") P.Environment?.set?.("sandbox");
  P.Initialize({ token: TOKEN });
  P.Checkout.open({
    items: [{ priceId: opts.priceId, quantity: 1 }],
    customer: opts.email ? { email: opts.email } : undefined,
    customData: { user_id: opts.userId },
  });
}
