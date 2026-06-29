-- Migration: Add website and metadata columns to public.suppliers
-- Run this in the Supabase SQL Editor to update your database schema.

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS business_type TEXT;

-- Comments explaining the new columns
COMMENT ON COLUMN public.suppliers.website IS 'Website URL of the supplier';
COMMENT ON COLUMN public.suppliers.contact_person IS 'Name of the primary contact person at the supplier';
COMMENT ON COLUMN public.suppliers.tax_id IS 'Tax identification number or business registration number';
COMMENT ON COLUMN public.suppliers.business_type IS 'Type of business (e.g. Manufacturer, Distributor, Trader)';
