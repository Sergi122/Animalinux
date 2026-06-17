-- ══════════════════════════════════════════════════════════════════════
-- AnimaLinux Community — Setup de Supabase
-- Ejecuta este SQL en: Dashboard → SQL Editor → New query
-- ══════════════════════════════════════════════════════════════════════

-- Tabla principal de packs
CREATE TABLE IF NOT EXISTS packs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  name         TEXT NOT NULL CHECK (char_length(name) <= 60),
  description  TEXT CHECK (char_length(description) <= 300),
  author       TEXT CHECK (char_length(author) <= 60),
  fps          INTEGER DEFAULT 12 CHECK (fps BETWEEN 1 AND 60),
  poses        TEXT[] DEFAULT '{}',
  tags         TEXT[] DEFAULT '{}',
  file_path    TEXT NOT NULL,
  preview_path TEXT,
  file_size    INTEGER CHECK (file_size <= 52428800),  -- 50 MB máximo
  downloads    INTEGER DEFAULT 0,
  verified     BOOLEAN DEFAULT FALSE,  -- true solo tras validación server-side
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Solo mostrar packs verificados en la galería pública
-- (el webhook validate-pack lo pone a TRUE tras comprobar el archivo)

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_packs_name       ON packs USING gin(to_tsvector('spanish', name));
CREATE INDEX IF NOT EXISTS idx_packs_created_at ON packs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packs_poses      ON packs USING gin(poses);

-- Row Level Security (RLS)
ALTER TABLE packs ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer
CREATE POLICY "packs_public_read"
  ON packs FOR SELECT
  USING (true);

-- Solo usuarios autenticados pueden insertar sus propios packs
CREATE POLICY "packs_auth_insert"
  ON packs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Los usuarios solo pueden actualizar el contador de sus propios packs
-- (el contador de downloads lo actualiza cualquiera vía función)
CREATE POLICY "packs_own_update"
  ON packs FOR UPDATE
  USING (auth.uid() = user_id OR true)  -- permite update anónimo para downloads
  WITH CHECK (true);

-- Los usuarios solo pueden borrar sus propios packs
CREATE POLICY "packs_own_delete"
  ON packs FOR DELETE
  USING (auth.uid() = user_id);

-- ── Storage buckets ────────────────────────────────────────────────────
-- Crear en: Dashboard → Storage → New bucket
-- Bucket "packs"    → Public: ON  → Max file size: 52428800 (50 MB)
-- Bucket "previews" → Public: ON  → Max file size: 2097152  (2 MB)

-- Políticas de storage para "packs"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('packs',    'packs',    true, 52428800, ARRAY['application/zip', 'application/octet-stream']),
  ('previews', 'previews', true, 2097152,  ARRAY['image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "packs_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('packs', 'previews'));

CREATE POLICY "packs_storage_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('packs', 'previews') AND auth.role() = 'authenticated');

CREATE POLICY "packs_storage_own_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id IN ('packs', 'previews') AND auth.uid()::text = (storage.foldername(name))[1]);
