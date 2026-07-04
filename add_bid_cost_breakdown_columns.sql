-- Migration: Add cost breakdown columns to order_suppliers table
-- Apply this via Supabase SQL Editor or apply_migration tool.

ALTER TABLE public.order_suppliers 
ADD COLUMN IF NOT EXISTS material_cost_percent numeric,
ADD COLUMN IF NOT EXISTS labor_cost_percent numeric,
ADD COLUMN IF NOT EXISTS overhead_cost_percent numeric,
ADD COLUMN IF NOT EXISTS profit_margin_percent numeric;

-- Comments explaining the new columns
COMMENT ON COLUMN public.order_suppliers.material_cost_percent IS 'Percentage of cost attributed to raw materials';
COMMENT ON COLUMN public.order_suppliers.labor_cost_percent IS 'Percentage of cost attributed to labor';
COMMENT ON COLUMN public.order_suppliers.overhead_cost_percent IS 'Percentage of cost attributed to factory overhead';
COMMENT ON COLUMN public.order_suppliers.profit_margin_percent IS 'Percentage of cost attributed to factory profit margin';
