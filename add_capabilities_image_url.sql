-- Migration to add image_url column to public.supplier_capabilities table
ALTER TABLE public.supplier_capabilities
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.supplier_capabilities.image_url IS 'Cloudflare R2 proxy URL of the product capability image';
