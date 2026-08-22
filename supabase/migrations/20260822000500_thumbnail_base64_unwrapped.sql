-- Postgres `encode(..., 'base64')` wraps output at 76 characters. Decoders
-- tolerate the newlines, but they inflate every thumbnail response and make the
-- value awkward to compare, so strip them at the source.

create or replace function public.get_clip_thumbnail(p_clip_id bigint)
returns table (mime text, bytes_base64 text, width integer, height integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.mime,
         translate(encode(t.bytes, 'base64'), E'\n\r', ''),
         t.width,
         t.height
    from public.clip_thumbnails t
   where t.clip_id = p_clip_id;
$$;
