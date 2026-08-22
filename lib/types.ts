import type { Platform } from "./clips/platform";

export type AppRole = "admin" | "member";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
};

export const TAG_KINDS = ["style", "client"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const TAG_KIND_LABELS: Record<TagKind, string> = {
  style: "Style",
  client: "Client",
};

export type Tag = {
  id: number;
  kind: TagKind;
  name: string;
  slug: string;
};

export type TagFacet = Tag & { clip_count: number };

export type ClipListItem = {
  id: number;
  ref_id: string;
  platform: Platform;
  url: string;
  canonical_url: string;
  title: string | null;
  author_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  has_thumbnail: boolean;
  tags: Tag[];
};

export type SearchClipsResult = {
  total: number;
  items: ClipListItem[];
};

export type ViewMode = "grid" | "list";

export const PAGE_SIZE = 20;
