import { createClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  type ClipListItem,
  type SearchClipsResult,
  type TagFacet,
} from "@/lib/types";
import type { Platform } from "./platform";

export type ClipQuery = {
  search?: string;
  tagIds?: number[];
  platform?: Platform | null;
  page?: number;
  refId?: string;
};

export async function searchClips({
  search,
  tagIds,
  platform,
  page = 1,
  refId,
}: ClipQuery): Promise<SearchClipsResult> {
  const supabase = await createClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  const { data, error } = await supabase.rpc("search_clips", {
    p_search: search?.trim() || null,
    p_tag_ids: tagIds?.length ? tagIds : null,
    p_platform: platform ?? null,
    p_limit: PAGE_SIZE,
    p_offset: (safePage - 1) * PAGE_SIZE,
    p_ref_id: refId?.trim() || null,
  });

  if (error) throw new Error(`Could not load clips: ${error.message}`);

  const result = (data ?? { total: 0, items: [] }) as SearchClipsResult;
  return { total: result.total ?? 0, items: result.items ?? [] };
}

export async function getTagFacets(): Promise<TagFacet[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tag_facets");
  if (error) throw new Error(`Could not load tags: ${error.message}`);
  return (data ?? []) as TagFacet[];
}

export async function getClipByRef(refId: string): Promise<ClipListItem | null> {
  // Reuse the search RPC so a detail view gets the same shape (tags, author,
  // thumbnail presence) as the list.
  const { items } = await searchClips({ refId, page: 1 });
  return items[0] ?? null;
}
