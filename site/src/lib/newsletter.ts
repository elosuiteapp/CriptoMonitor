import { supabase } from "./supabase";

export interface EditionCard {
  slug: string;
  title: string;
  excerpt: string;
  cover_emoji: string | null;
  min_tier: "free" | "pro" | "expert";
  published_at: string | null;
}
export interface Edition extends EditionCard {
  teaser_md: string;
}

// Colunas PÚBLICAS (sem body_md — o paywall vive no grant/RLS do banco).
const COLS = "slug,title,excerpt,teaser_md,cover_emoji,min_tier,published_at";

export async function listEditions(): Promise<EditionCard[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("newsletter_editions")
    .select(COLS)
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data as EditionCard[]) ?? [];
}

export async function getEdition(slug: string): Promise<Edition | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("newsletter_editions")
    .select(COLS)
    .eq("published", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return (data as Edition) ?? null;
}

export const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "";

export const TIER_LABEL: Record<string, string> = {
  free: "Grátis",
  pro: "Pro",
  expert: "Expert",
};
