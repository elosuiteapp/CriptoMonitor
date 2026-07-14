import { supabase } from "../supabase";

export async function invoke(action: string, extra: Record<string, unknown> = {}, fn = "okx-bot") {
  const { data, error } = await supabase.functions.invoke(fn, { body: { action, ...extra } });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const b = await ctx.json().catch(() => null);
      if (b?.error) detail = b.error;
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  if (data?.code != null && data.code !== "0" && data.code !== 0) {
    const sMsg = (data?.data?.[0]?.sMsg ?? "").trim();
    throw new Error(sMsg || data?.msg || `Erro ${data.code}`);
  }
  return data;
}
