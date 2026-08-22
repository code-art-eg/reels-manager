-- Fix: writes to clips/clip_tags failed for any role without USAGE on the
-- `private` schema (notably service_role) with "permission denied for schema
-- private".
--
-- The search_text maintenance triggers were plain (security invoker) functions,
-- so their bodies resolved `private.*` as the *calling* role. Trigger firing
-- itself is not privilege-checked, which is why this only surfaced when a
-- service-role delete cascaded into clip_tags.
--
-- These functions only recompute a denormalised column from rows the caller is
-- already touching, so running them as the owner is safe and removes the
-- dependency on per-role grants.

grant usage on schema private to service_role;

create or replace function private.clip_search_text(p_clip public.clips)
returns text
language sql
stable
security definer
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
security definer
set search_path = ''
as $$
begin
  new.search_text := private.clip_search_text(new);
  return new;
end;
$$;

create or replace function private.clip_tags_touch_clip()
returns trigger
language plpgsql
security definer
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

-- These are internal maintenance helpers; nothing should call them directly.
revoke execute on function private.clip_search_text(public.clips) from public, anon;
revoke execute on function private.clips_refresh_search_text() from public, anon;
revoke execute on function private.clip_tags_touch_clip() from public, anon;
