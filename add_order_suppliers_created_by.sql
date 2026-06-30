-- Migration: Add created_by column to public.order_suppliers
-- Run this in the Supabase SQL Editor or apply via MCP to update your database schema.

ALTER TABLE public.order_suppliers ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Comment explaining the new column
COMMENT ON COLUMN public.order_suppliers.created_by IS 'Email address of the user who uploaded or created this bid';
