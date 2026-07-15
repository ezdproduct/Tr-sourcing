-- Migration: Create sheets_raw_suppliers staging table and synchronization trigger.
-- Also configures Row Level Security (RLS) policies.
-- Run this in your Supabase SQL Editor.

-- 1. Create raw staging table
CREATE TABLE IF NOT EXISTS public.sheets_raw_suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_name text NOT NULL,
    raw_email text,
    raw_phone text,
    raw_address text,
    raw_website text,
    raw_contact_person text,
    raw_tax_id text,
    raw_established_date text,
    raw_payment_terms text,
    raw_factory_area text,
    raw_total_staff text,
    raw_workers text,
    raw_capacity text,
    raw_main_product text,
    raw_main_wood text,
    raw_notes text,
    status text DEFAULT 'pending', -- 'pending', 'processed', 'error'
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Trigger function to parse staging row and upsert into public.suppliers
CREATE OR REPLACE FUNCTION public.sync_raw_supplier_to_main()
RETURNS TRIGGER AS $$
DECLARE
    existing_id uuid;
    parsed_year integer;
    compiled_notes text;
    merged_products text[];
BEGIN
    -- Extract 4-digit year from established date using regex
    BEGIN
        IF NEW.raw_established_date IS NOT NULL AND NEW.raw_established_date ~ '[0-9]{4}' THEN
            parsed_year := NULLIF(substring(NEW.raw_established_date from '[0-9]{4}'), '')::integer;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        parsed_year := NULL;
    END;

    -- Compile rich notes
    compiled_notes := CONCAT_WS('; ',
        CASE WHEN NULLIF(TRIM(NEW.raw_factory_area), '') IS NOT NULL THEN 'Diện tích: ' || TRIM(NEW.raw_factory_area) END,
        CASE WHEN NULLIF(TRIM(NEW.raw_workers), '') IS NOT NULL THEN 'Nhân công: ' || TRIM(NEW.raw_workers) END,
        CASE WHEN NULLIF(TRIM(NEW.raw_notes), '') IS NOT NULL THEN 'Ghi chú: ' || TRIM(NEW.raw_notes) END
    );

    -- Build main products array
    merged_products := ARRAY[]::text[];
    IF NULLIF(TRIM(NEW.raw_main_product), '') IS NOT NULL THEN
        merged_products := array_append(merged_products, TRIM(NEW.raw_main_product));
    END IF;
    IF NULLIF(TRIM(NEW.raw_main_wood), '') IS NOT NULL THEN
        merged_products := array_append(merged_products, 'Gỗ làm: ' || TRIM(NEW.raw_main_wood));
    END IF;

    -- Look up existing supplier by name (case-insensitive, trimmed)
    SELECT id INTO existing_id 
    FROM public.suppliers 
    WHERE TRIM(LOWER(name)) = TRIM(LOWER(NEW.raw_name))
    LIMIT 1;

    IF existing_id IS NULL THEN
        -- Insert new supplier
        INSERT INTO public.suppliers (
            name, 
            email, 
            phone, 
            address, 
            website, 
            contact_person,
            tax_id,
            year_founded,
            payment_terms,
            company_size,
            max_capacity_monthly,
            main_products,
            notes,
            status, 
            sourcing_stage,
            updated_at
        )
        VALUES (
            TRIM(NEW.raw_name),
            TRIM(NEW.raw_email),
            TRIM(NEW.raw_phone),
            TRIM(NEW.raw_address),
            TRIM(NEW.raw_website),
            TRIM(NEW.raw_contact_person),
            TRIM(NEW.raw_tax_id),
            parsed_year,
            TRIM(NEW.raw_payment_terms),
            TRIM(NEW.raw_total_staff),
            TRIM(NEW.raw_capacity),
            merged_products,
            NULLIF(compiled_notes, ''),
            'Prospect',
            'New',
            now()
        );
    ELSE
        -- Update existing supplier
        UPDATE public.suppliers
        SET 
            email = COALESCE(TRIM(NEW.raw_email), email),
            phone = COALESCE(TRIM(NEW.raw_phone), phone),
            address = COALESCE(TRIM(NEW.raw_address), address),
            website = COALESCE(TRIM(NEW.raw_website), website),
            contact_person = COALESCE(TRIM(NEW.raw_contact_person), contact_person),
            tax_id = COALESCE(TRIM(NEW.raw_tax_id), tax_id),
            year_founded = COALESCE(parsed_year, year_founded),
            payment_terms = COALESCE(TRIM(NEW.raw_payment_terms), payment_terms),
            company_size = COALESCE(TRIM(NEW.raw_total_staff), company_size),
            max_capacity_monthly = COALESCE(TRIM(NEW.raw_capacity), max_capacity_monthly),
            main_products = CASE WHEN merged_products <> ARRAY[]::text[] THEN merged_products ELSE main_products END,
            notes = COALESCE(NULLIF(compiled_notes, ''), notes),
            updated_at = now()
        WHERE id = existing_id;
    END IF;

    -- Update staging record status
    UPDATE public.sheets_raw_suppliers
    SET status = 'processed'
    WHERE id = NEW.id;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.sheets_raw_suppliers
    SET status = 'error', error_message = SQLERRM
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger
DROP TRIGGER IF EXISTS tr_sync_raw_supplier ON public.sheets_raw_suppliers;
CREATE TRIGGER tr_sync_raw_supplier
AFTER INSERT ON public.sheets_raw_suppliers
FOR EACH ROW
EXECUTE FUNCTION public.sync_raw_supplier_to_main();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_raw_suppliers ENABLE ROW LEVEL SECURITY;

-- 5. Set up RLS Policies for public.suppliers (Avoid duplicates)
DROP POLICY IF EXISTS "Allow public read access to suppliers" ON public.suppliers;
CREATE POLICY "Allow public read access to suppliers" ON public.suppliers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated/service_role to manage suppliers" ON public.suppliers;
CREATE POLICY "Allow authenticated/service_role to manage suppliers" ON public.suppliers
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 6. Set up RLS Policies for public.sheets_raw_suppliers (Service Role only)
DROP POLICY IF EXISTS "Allow service_role to manage raw staging table" ON public.sheets_raw_suppliers;
CREATE POLICY "Allow service_role to manage raw staging table" ON public.sheets_raw_suppliers
  FOR ALL USING (auth.role() = 'service_role');
