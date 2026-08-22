-- Reels Manager: shared clip library
-- Creates profiles/roles, clips with human-readable PT-#### refs, open-ended
-- tags, thumbnail blobs, search support and RLS policies.

-- Trigram index support for substring search. Supabase keeps extensions in the
-- dedicated `extensions` schema.
create extension if not exists pg_trgm with schema extensions;

-- Helper functions live in a schema that is not exposed over the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Roles / profiles
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Application profile and role for each auth user.';

-- Returns true when the *calling* user is an admin. Security definer so the
-- lookup is not itself subject to RLS on profiles (which would recurse).
create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Members may edit their own profile, but must not promote themselves.
create or replace function private.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not private.is_admin() then
    raise exception 'only admins can change a user role';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function private.prevent_role_escalation();

-- Provision a profile whenever an auth user is created. The very first user
-- becomes the admin so the instance can be bootstrapped.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing bigint;
begin
  select count(*) into v_existing from public.profiles;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when v_existing = 0 then 'admin'::public.app_role
         else 'member'::public.app_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Clips
-- ---------------------------------------------------------------------------

create sequence public.clip_ref_seq as bigint start 1;

create table public.clips (
  id bigint generated always as identity primary key,
  ref_id text not null unique
    default ('PT-' || lpad(nextval('public.clip_ref_seq')::text, 4, '0')),
  platform text not null check (platform in ('instagram', 'tiktok')),
  url text not null,
  canonical_url text not null,
  external_id text,
  title text,
  author_name text,
  notes text,
  -- Denormalised haystack for search across ref/url/notes/tags.
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.clips is 'Shared library of Instagram Reels / TikTok clips.';

-- Prevents the same reel being added twice when we can parse its native id.
create unique index clips_platform_external_id_key
  on public.clips (platform, external_id)
  where external_id is not null;

create index clips_created_at_idx on public.clips (created_at desc, id desc);
create index clips_created_by_idx on public.clips (created_by);
create index clips_platform_idx on public.clips (platform);
create index clips_search_text_trgm_idx
  on public.clips using gin (search_text extensions.gin_trgm_ops);

-- Thumbnails live in their own table so list queries never drag blobs along.
create table public.clip_thumbnails (
  clip_id bigint primary key references public.clips (id) on delete cascade,
  bytes bytea not null,
  mime text not null default 'image/webp',
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tags (style + client, open ended)
-- ---------------------------------------------------------------------------

create table public.tags (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('style', 'client')),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  constraint tags_kind_slug_key unique (kind, slug)
);

create table public.clip_tags (
  clip_id bigint not null references public.clips (id) on delete cascade,
  tag_id bigint not null references public.tags (id) on delete cascade,
  primary key (clip_id, tag_id)
);

-- PK covers clip_id lookups; tag_id needs its own index for filtering.
create index clip_tags_tag_id_idx on public.clip_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Search text maintenance
-- ---------------------------------------------------------------------------

create or replace function private.clip_search_text(p_clip public.clips)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' ',
    p_clip.ref_id,
    p_clip.url,
    p_clip.canonical_url,
    p_clip.platform,
    coalesce(p_clip.title, ''),
    coalesce(p_clip.author_name, ''),
    coalesce(p_clip.notes, ''),
    (
      select string_agg(t.name, ' ')
      from public.clip_tags ct
      join public.tags t on t.id = ct.tag_id
      where ct.clip_id = p_clip.id
    )
  );
$$;

create or replace function private.clips_refresh_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := private.clip_search_text(new);
  return new;
end;
$$;

create trigger clips_refresh_search_text
  before insert or update of ref_id, url, canonical_url, platform, title,
                             author_name, notes
  on public.clips
  for each row execute function private.clips_refresh_search_text();

-- When tags change, re-stamp the owning clip (fires the BEFORE trigger above).
create or replace function private.clip_tags_touch_clip()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_clip_id bigint := coalesce(new.clip_id, old.clip_id);
  v_text text;
begin
  select private.clip_search_text(c) into v_text
    from public.clips c
   where c.id = v_clip_id;

  update public.clips
     set search_text = coalesce(v_text, '')
   where id = v_clip_id;
  return null;
end;
$$;

create trigger clip_tags_touch_clip
  after insert or delete on public.clip_tags
  for each row execute function private.clip_tags_touch_clip();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.clips           enable row level security;
alter table public.clip_thumbnails enable row level security;
alter table public.tags            enable row level security;
alter table public.clip_tags       enable row level security;

-- profiles: everyone signed in can see the team; only self-edit, no self-promote.
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- clips: one shared library. Any member may add, annotate and delete.
create policy clips_select_authenticated on public.clips
  for select to authenticated using (true);

create policy clips_insert_authenticated on public.clips
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy clips_update_authenticated on public.clips
  for update to authenticated using (true) with check (true);

create policy clips_delete_authenticated on public.clips
  for delete to authenticated using (true);

create policy clip_thumbnails_select_authenticated on public.clip_thumbnails
  for select to authenticated using (true);

create policy clip_thumbnails_insert_authenticated on public.clip_thumbnails
  for insert to authenticated with check (true);

create policy clip_thumbnails_update_authenticated on public.clip_thumbnails
  for update to authenticated using (true) with check (true);

create policy clip_thumbnails_delete_authenticated on public.clip_thumbnails
  for delete to authenticated using (true);

-- tags: grow freely; only admins prune or rename.
create policy tags_select_authenticated on public.tags
  for select to authenticated using (true);

create policy tags_insert_authenticated on public.tags
  for insert to authenticated with check (true);

create policy tags_update_admin on public.tags
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy tags_delete_admin on public.tags
  for delete to authenticated using ((select private.is_admin()));

create policy clip_tags_select_authenticated on public.clip_tags
  for select to authenticated using (true);

create policy clip_tags_insert_authenticated on public.clip_tags
  for insert to authenticated with check (true);

create policy clip_tags_delete_authenticated on public.clip_tags
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Grants (RLS is the gate; anon gets nothing)
-- ---------------------------------------------------------------------------

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.clips to authenticated;
grant select, insert, update, delete on public.clip_thumbnails to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, delete on public.clip_tags to authenticated;
grant usage on sequence public.clip_ref_seq to authenticated;
