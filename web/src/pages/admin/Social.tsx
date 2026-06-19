import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

interface Status {
  telegram: boolean;
  x: boolean;
  autopost: string;
}
interface Post {
  id: string;
  tweet: string;
  telegram_md: string;
  posted_x: boolean;
  posted_telegram: boolean;
  created_at: string;
}

/** Admin · Social — conecta Telegram e X, liga/desliga o auto-post diário,
 *  pré-visualiza, posta na hora e mostra o histórico. As credenciais ficam
 *  guardadas no banco (app_secrets, só service-role) via RPC; nunca voltam pro front. */
export default function AdminSocial() {
  const [status, setStatus] = useState<Status | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [preview, setPreview] = useState<{ tweet: string; telegram_text: string } | null>(null);

  // inputs (não exibem o valor salvo; só status “configurado”)
  const [tgToken, setTgToken] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [xKey, setXKey] = useState("");
  const [xSecret, setXSecret] = useState("");
  const [xToken, setXToken] = useState("");
  const [xTokenSecret, setXTokenSecret] = useState("");

  const load = useCallback(async () => {
    const { data: st } = await supabase.rpc("social_config_status");
    setStatus((st as Status) ?? null);
    const { data: ps } = await supabase
      .from("social_posts")
      .select("id, tweet, telegram_md, posted_x, posted_telegram, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setPosts((ps as Post[] | null) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSecret(key: string, value: string, label: string) {
    if (!value.trim()) return;
    setBusy(key);
    setMsg(null);
    try {
      const { error } = await supabase.rpc("set_social_secret", { p_key: key, p_value: value.trim() });
      if (error) throw error;
      setMsg({ kind: "ok", text: `${label} salvo.` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setBusy(null);
    }
  }

  async function saveTelegram() {
    if (tgToken.trim()) await saveSecret("telegram_bot_token", tgToken, "Token do bot");
    if (tgChat.trim()) await saveSecret("telegram_channel_id", tgChat, "Canal do Telegram");
    setTgToken("");
    setTgChat("");
  }
  async function saveX() {
    if (xKey.trim()) await saveSecret("x_api_key", xKey, "API key");
    if (xSecret.trim()) await saveSecret("x_api_secret", xSecret, "API secret");
    if (xToken.trim()) await saveSecret("x_access_token", xToken, "Access token");
    if (xTokenSecret.trim()) await saveSecret("x_access_secret", xTokenSecret, "Access secret");
    setXKey("");
    setXSecret("");
    setXToken("");
    setXTokenSecret("");
  }

  async function toggleAutopost() {
    const next = status?.autopost === "on" ? "off" : "on";
    await saveSecret("social_autopost", next, `Auto-post ${next === "on" ? "ligado" : "desligado"}`);
  }

  async function runFn(body: Record<string, unknown>, kind: "preview" | "post") {
    setBusy(kind);
    setMsg(null);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("social-post", { body });
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const b = await ctx.json().catch(() => null);
          if (b?.error) detail = b.error;
        }
        throw new Error(detail);
      }
      if (kind === "preview") {
        setPreview({ tweet: data?.tweet ?? "", telegram_text: data?.telegram_text ?? "" });
      } else {
        const tg = data?.posted_telegram ? "Telegram ✓" : "Telegram —";
        const x = data?.posted_x ? "X ✓" : "X —";
        setMsg({ kind: "ok", text: `Publicado: ${tg} · ${x}` });
        await load();
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(null);
    }
  }

  const Badge = ({ ok }: { ok: boolean }) => (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
      {ok ? "conectado" : "não conectado"}
    </span>
  );

  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground";

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Social · X & Telegram</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte as contas, ligue o auto-post e a IA publica o “read institucional do BTC” todo dia (~10h BRT).
          As chaves ficam guardadas com segurança e nunca aparecem aqui depois de salvas.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg border p-3 text-sm ${msg.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"}`}>
          {msg.text}
        </div>
      )}

      {/* Auto-post + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">Auto-post diário</span>
          <button
            onClick={toggleAutopost}
            disabled={busy !== null}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${status?.autopost === "on" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
          >
            {status?.autopost === "on" ? "LIGADO" : "DESLIGADO"}
          </button>
          <span className="text-xs text-muted-foreground">Telegram <Badge ok={!!status?.telegram} /> · X <Badge ok={!!status?.x} /></span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => runFn({ preview: true }, "preview")} disabled={busy !== null} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {busy === "preview" ? "Gerando…" : "Pré-visualizar"}
          </button>
          <button onClick={() => runFn({ force: true }, "post")} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {busy === "post" ? "Postando…" : "Postar agora"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.05] p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tweet (X) · {preview.tweet.length} caracteres</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{preview.tweet}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telegram</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{preview.telegram_text}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">Pré-visualização (não foi publicado).</p>
        </div>
      )}

      {/* Telegram */}
      <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Telegram</h2>
          <Badge ok={!!status?.telegram} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={input} placeholder="Token do bot (do @BotFather)" value={tgToken} onChange={(e) => setTgToken(e.target.value)} />
          <input className={input} placeholder="ID/@ do canal (ex.: @orbeview)" value={tgChat} onChange={(e) => setTgChat(e.target.value)} />
        </div>
        <button onClick={saveTelegram} disabled={busy !== null} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Salvar Telegram
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Crie o bot no <strong>@BotFather</strong> → copie o token. Crie um canal, adicione o bot como <strong>admin</strong>, e use o @ do canal (ou o id <code>-100…</code>).
        </p>
      </div>

      {/* X */}
      <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">X (Twitter)</h2>
          <Badge ok={!!status?.x} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={input} placeholder="API Key" value={xKey} onChange={(e) => setXKey(e.target.value)} />
          <input className={input} placeholder="API Secret" value={xSecret} onChange={(e) => setXSecret(e.target.value)} />
          <input className={input} placeholder="Access Token" value={xToken} onChange={(e) => setXToken(e.target.value)} />
          <input className={input} placeholder="Access Token Secret" value={xTokenSecret} onChange={(e) => setXTokenSecret(e.target.value)} />
        </div>
        <button onClick={saveX} disabled={busy !== null} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Salvar X
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          No <strong>developer.x.com</strong> → crie um App com permissão <strong>Read and write</strong> (OAuth 1.0a) → gere as 4 chaves (API Key/Secret + Access Token/Secret).
        </p>
      </div>

      {/* Histórico */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Últimos posts</h2>
        {posts == null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum post ainda.</p>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{new Date(p.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={p.posted_telegram ? "text-emerald-500" : "text-muted-foreground"}>TG {p.posted_telegram ? "✓" : "—"}</span>
                  <span className={p.posted_x ? "text-emerald-500" : "text-muted-foreground"}>X {p.posted_x ? "✓" : "—"}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-foreground">{p.tweet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
