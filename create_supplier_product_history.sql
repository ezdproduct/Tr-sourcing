-- Migration: Create supplier_product_history table
-- Run this to create the table and matching index

CREATE TABLE IF NOT EXISTS public.supplier_product_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    capacity TEXT,
    ordered_quantity NUMERIC DEFAULT 0,
    event_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_supplier_prod_hist_supplier_id ON public.supplier_product_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prod_hist_product_name ON public.supplier_product_history(product_name);
