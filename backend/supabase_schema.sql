-- ==============================================================================
-- Campus Print Application - Supabase PostgreSQL Schema & Storage Setup
-- ==============================================================================
-- Run this SQL in your Supabase Project -> SQL Editor to initialize the database
-- and configure the storage bucket for PDF print jobs.
-- ==============================================================================

-- 1. Create the `jobs` table
create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    token text unique not null,
    user_email text not null,
    user_name text,
    total_files integer not null default 1,
    total_pages integer not null default 0,
    total_cost integer not null default 0,
    files jsonb not null default '[]'::jsonb,
    combined_color_file_url text,
    combined_bw_file_url text,
    razorpay_order_id text,
    razorpay_payment_id text,
    payment_status text not null default 'pending', -- 'pending', 'paid', 'offline_cash', 'failed'
    status text not null default 'pending',         -- 'pending', 'completed', 'cancelled'
    paid_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now()
);

-- 2. Indexes for high-performance querying
create index if not exists idx_jobs_token on public.jobs (token);
create index if not exists idx_jobs_user_email on public.jobs (user_email);
create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_jobs_payment_status on public.jobs (payment_status);
create index if not exists idx_jobs_created_at on public.jobs (created_at desc);

-- 3. Enable Row Level Security (RLS)
alter table public.jobs enable row level security;

-- Policy: Allow service role (backend API) and anon full access to read/write jobs
-- Note: Authentication is enforced on the FastAPI backend using Firebase JWTs.
create policy "Allow backend full access on jobs"
    on public.jobs
    for all
    using (true)
    with check (true);

-- 4. Create the Supabase Storage Bucket for print job PDFs
insert into storage.buckets (id, name, public)
values ('print-jobs', 'print-jobs', true)
on conflict (id) do update set public = true;

-- Policy: Allow public download of PDFs in 'print-jobs' bucket
create policy "Public Access to Print Job PDFs"
    on storage.objects
    for select
    using (bucket_id = 'print-jobs');

-- Policy: Allow backend (authenticated or service role) to upload PDFs
create policy "Allow Uploads to Print Job PDFs"
    on storage.objects
    for insert
    with check (bucket_id = 'print-jobs');

create policy "Allow Updates to Print Job PDFs"
    on storage.objects
    for update
    using (bucket_id = 'print-jobs');

create policy "Allow Deletes on Print Job PDFs"
    on storage.objects
    for delete
    using (bucket_id = 'print-jobs');

