-- Migration to add item_type column to public.supplier_capabilities table
ALTER TABLE public.supplier_capabilities
ADD COLUMN IF NOT EXISTS item_type character varying DEFAULT 'PRODUCT';
