-- Adds an exact-reference filter to search_clips so the clip detail page can
-- fetch one clip by its PT-#### id without relying on a substring search
-- (which could push the intended clip off the first page).
--
-- The signature changes, so the old function is dropped rather than overloaded
-- (an added defaulted parameter would make calls ambiguous).

drop function if exists public.search_clips(text, bigint[], text, integer, integer);

create or replace function public.search_clips(
  p_search text default null,
  p_tag_ids bigint[] default null,
  p_platform text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_ref_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select c.*
      from public.clips c
     where (p_ref_id is null or c.ref_id = upper(btrim(p_ref_id)))
       and (
             p_search is null
             or btrim(p_search) = ''
             or c.search_text ilike '%' || btrim(p_search) || '%'
           )
       and (p_platform is null or c.platform = p_platform)
       and (
             p_tag_ids is null
             or cardinality(p_tag_ids) = 0
             -- Require every selected tag to be present (AND semantics).
             or (
                  select count(distinct ct.tag_id)
                    from public.clip_tags ct
                   where ct.clip_id = c.id
                     and ct.tag_id = any (p_tag_ids)
                ) = cardinality(p_tag_ids)
           )
  ),
  page as (
    select f.id,
           f.ref_id,
           f.platform,
           f.url,
           f.canonical_url,
           f.title,
           f.author_name,
           f.notes,
           f.created_at,
           f.created_by,
           pr.email as created_by_email,
           pr.full_name as created_by_name,
           exists (
             select 1 from public.clip_thumbnails t where t.clip_id = f.id
           ) as has_thumbnail,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', tg.id,
                        'kind', tg.kind,
                        'name', tg.name,
                        'slug', tg.slug
                      )
                      order by tg.kind, tg.name
                    )
               from public.clip_tags ct
               join public.tags tg on tg.id = ct.tag_id
              where ct.clip_id = f.id
           ), '[]'::jsonb) as tags
      from filtered f
      left join public.profiles pr on pr.id = f.created_by
     order by f.created_at desc, f.id desc
     limit greatest(coalesce(p_limit, 20), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(page) order by page.created_at desc, page.id desc)
         from page),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.search_clips(
  text, bigint[], text, integer, integer, text
) to authenticated;
