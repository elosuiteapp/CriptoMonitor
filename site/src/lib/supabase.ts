import { createClient } from "@supabase/supabase-js";

// Cliente Supabase do site público (anon, chave pública). Usado no BUILD (SSG, para
// montar as páginas da newsletter) e no CLIENTE (cadastro por magic-link). Se as envs
// não estiverem definidas, fica null e os helpers degradam para vazio (build não quebra).
const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;
