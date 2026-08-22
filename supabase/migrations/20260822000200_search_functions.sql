-- Search / browse helpers.
--
-- Both functions are `security invoker` so the caller's RLS policies still
-- apply; they exist to express set logic that is awkward over the REST API
-- (multi-tag AND filtering, and a page of rows plus its total in one round
-- trip).

create or replace function public.search_clips(
  p_search text default null,
  p_tag_ids bigint[] default null,
  p_platform text default null,
  p_limit integer default 20,
  p_offset integer default 0
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
     where (
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

grant execute on function public.search_clips(text, bigint[], text, integer, integer)
  to authenticated;

-- Tag list with usage counts, for the filter rail and autocomplete.
create or replace function public.tag_facets()
returns table (
  id bigint,
  kind text,
  name text,
  slug text,
  clip_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id,
         t.kind,
         t.name,
         t.slug,
         count(ct.clip_id) as clip_count
    from public.tags t
    left join public.clip_tags ct on ct.tag_id = t.id
   group by t.id, t.kind, t.name, t.slug
   order by t.kind, t.name;
$$;

grant execute on function public.tag_facets() to authenticated;
