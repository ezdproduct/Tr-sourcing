-- SQL Schema Migration: Phase 3 - Factory Audit (Đánh giá nhà xưởng)
-- Run this script in the Supabase SQL Editor to create the necessary table.

CREATE TABLE IF NOT EXISTS public.factory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    audit_date DATE NOT NULL,
    auditor_name TEXT NOT NULL,
    quality_control_score INT CHECK (quality_control_score >= 1 AND quality_control_score <= 5),
    production_capacity_score INT CHECK (production_capacity_score >= 1 AND production_capacity_score <= 5),
    total_score NUMERIC(3,2), -- Average score (1.00 to 5.00)
    audit_status TEXT NOT NULL CHECK (audit_status IN ('Scheduled', 'In Progress', 'Completed')),
    audit_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
