import { getLocale } from "../hooks/useLocale";
import { supabase } from "./supabase";

export type Tier = "free" | "pro" | "expert";

export interface EditionCard {
  slug: string;
  title: string;
  excerpt: string;
  cover_emoji: string | null;
  min_tier: Tier;
  module?: string; // crypto | b3 | forex
  published_at: string;
}

export const MODULE_LABEL: Record<string, string> = { crypto: "Cripto", b3: "B3", forex: "Forex" };

export interface EditionFull extends EditionCard {
  body_md: string | null; // null quando o plano não alcança o min_tier
  locked: boolean;
}

export const TIER_LABEL: Record<Tier, string> = { free: "Free", pro: "Pro", expert: "Expert" };

/** Lista de edições publicadas (colunas de vitrine; corpo não vem aqui). */
export async function listEditions(): Promise<EditionCard[]> {
  const { data } = await supabase
    .from("newsletter_editions")
    .select("slug, title, excerpt, cover_emoji, min_tier, module, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false });
  return (data as EditionCard[] | null) ?? [];
}

/** Edição completa — o corpo (body_md) só vem se o plano permitir (RPC com paywall). */
export async function getEditionFull(slug: string): Promise<EditionFull | null> {
  const { data, error } = await supabase.rpc("newsletter_full", { p_slug: slug });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return null;
  return row as EditionFull;
}

export function fmtDate(iso: string): string {
  const loc = getLocale() === "en" ? "en-US" : "pt-BR";
  return new Date(iso).toLocaleDateString(loc, { day: "2-digit", month: "long", year: "numeric" });
}
