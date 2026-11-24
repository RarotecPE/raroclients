ALTER TABLE propostas
  ADD COLUMN IF NOT EXISTS solicitado_por_id text,
  ADD COLUMN IF NOT EXISTS solicitado_por_nome text,
  ADD COLUMN IF NOT EXISTS solicitado_por_email text;
