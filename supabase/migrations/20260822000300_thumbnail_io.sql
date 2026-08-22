-- Thumbnails are stored as real `bytea`. PostgREST cannot accept binary in a
-- JSON body, so reads and writes go through these helpers which move the blob
-- as base64. Both are `security invoker`, so clip_thumbnails RLS still applies.

create or replace function public.set_clip_thumbnail(
  p_clip_id bigint,
  p_bytes_base64 text,
  p_mime text default 'image/webp',
  p_width integer default null,
  p_height integer default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.clip_thumbnails (clip_id, bytes, mime, width, height)
  values (
    p_clip_id,
    decode(p_bytes_base64, 'base64'),
    coalesce(p_mime, 'image/webp'),
    p_width,
    p_height
  )
  on conflict (clip_id) do update
     set bytes  = excluded.bytes,
         mime   = excluded.mime,
         width  = excluded.width,
         height = excluded.height;
$$;

grant execute on function public.set_clip_thumbnail(bigint, text, text, integer, integer)
  to authenticated;

create or replace function public.get_clip_thumbnail(p_clip_id bigint)
returns table (mime text, bytes_base64 text, width integer, height integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.mime, encode(t.bytes, 'base64'), t.width, t.height
    from public.clip_thumbnails t
   where t.clip_id = p_clip_id;
$$;

grant execute on function public.get_clip_thumbnail(bigint) to authenticated;
