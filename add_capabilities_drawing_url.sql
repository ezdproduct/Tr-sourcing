-- Migration to add drawing_url column to public.supplier_capabilities table
ALTER TABLE public.supplier_capabilities
ADD COLUMN IF NOT EXISTS drawing_url TEXT;

COMMENT ON COLUMN public.supplier_capabilities.drawing_url IS 'Cloudflare R2 proxy URL of the technical drawing file';
