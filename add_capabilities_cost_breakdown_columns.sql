-- Migration to add cost breakdown columns to public.supplier_capabilities table
ALTER TABLE public.supplier_capabilities
ADD COLUMN IF NOT EXISTS material_cost_percent numeric,
ADD COLUMN IF NOT EXISTS labor_cost_percent numeric,
ADD COLUMN IF NOT EXISTS overhead_cost_percent numeric,
ADD COLUMN IF NOT EXISTS profit_margin_percent numeric;
