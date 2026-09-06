-- Migration 283: club_logos reference table + club-logos public storage bucket
-- Stores a name -> image URL mapping for club crests (self-hosted in Storage)
-- and national flags (hotlinked from flagcdn.com, a stable public flag CDN).

create table public.club_logos (
  id bigint generated always as identity primary key,
  name text not null unique,
  type text not null check (type in ('club', 'country')),
  logo_url text not null,
  created_at timestamptz not null default now()
);

alter table public.club_logos enable row level security;

create policy "club_logos_public_read"
  on public.club_logos for select using (true);

insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

create policy "club_logos_bucket_public_read"
  on storage.objects for select using (bucket_id = 'club-logos');
