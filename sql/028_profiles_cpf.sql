-- ═══════════════════════════════════════════════════════════════════════════
-- 028_profiles_cpf.sql — CPF do usuário (exigido pelo Asaas no checkout BRL)
-- O Asaas exige cpfCnpj ao criar o cliente. Coletamos no perfil e enviamos no
-- checkout em reais (asaas-checkout). RLS de profiles já restringe a leitura/edição
-- de cada linha ao próprio dono.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists cpf text;
comment on column public.profiles.cpf is 'CPF/CNPJ (só dígitos ou formatado) — usado no checkout Asaas (BRL)';
