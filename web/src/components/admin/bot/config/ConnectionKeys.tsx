import type { Dispatch, SetStateAction } from "react";

/** Conexão (chaves) — API Key/Secret (+Passphrase na OKX) da corretora demo/testnet. */
export default function ConnectionKeys({ showKeys, setShowKeys, isBinance, connected, input, apiKey, setApiKey, apiSecret, setApiSecret, passphrase, setPassphrase, saveKeys, busy }: {
  showKeys: boolean;
  setShowKeys: Dispatch<SetStateAction<boolean>>;
  isBinance: boolean;
  connected: boolean;
  input: string;
  apiKey: string;
  setApiKey: Dispatch<SetStateAction<string>>;
  apiSecret: string;
  setApiSecret: Dispatch<SetStateAction<string>>;
  passphrase: string;
  setPassphrase: Dispatch<SetStateAction<string>>;
  saveKeys: () => void;
  busy: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <button onClick={() => setShowKeys((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
        <span>{isBinance ? "Conexão Binance (Testnet)" : "Conexão OKX (Demo)"} {connected && <span className="ml-1 text-[11px] font-normal text-emerald-500">· conectada</span>}</span>
        <span className="text-muted-foreground">{showKeys ? "▲" : "▼"}</span>
      </button>
      {showKeys && (
        <div className="mt-3">
          <div className={`grid gap-2 ${isBinance ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            <input className={input} placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <input className={input} placeholder="API Secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
            {!isBinance && <input className={input} placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
          </div>
          <button onClick={saveKeys} disabled={busy !== null} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busy === "keys" ? "Salvando…" : "Salvar chaves"}</button>
          {isBinance
            ? <p className="mt-2 text-[11px] text-muted-foreground">Chaves do <strong>Binance Futures Testnet</strong> (testnet.binancefuture.com) — dinheiro fake, sem KYC. Cole a API Key e a Secret.</p>
            : <p className="mt-2 text-[11px] text-muted-foreground">Chaves do <strong>Demo Trading</strong> da OKX (não as reais). Permissão de <strong>Trade</strong>; nunca saque; sem restrição de IP.</p>}
        </div>
      )}
    </div>
  );
}
