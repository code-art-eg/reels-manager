import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ThumbRow = {
  mime: string;
  bytes_base64: string;
  width: number | null;
  height: number | null;
};

/**
 * Streams a clip thumbnail out of Postgres. Goes through the request-scoped
 * Supabase client so RLS decides whether the caller may see it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clipId = Number.parseInt(id, 10);
  if (!Number.isInteger(clipId) || clipId <= 0) {
    return new NextResponse("Bad clip id", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data, error } = await supabase.rpc("get_clip_thumbnail", {
    p_clip_id: clipId,
  });
  if (error) return new NextResponse("Lookup failed", { status: 500 });

  const row = (data as ThumbRow[] | null)?.[0];
  if (!row) return new NextResponse("Not found", { status: 404 });

  const bytes = Buffer.from(row.bytes_base64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": row.mime || "image/webp",
      "content-length": String(bytes.byteLength),
      // Per-user cache only: the bytes are behind an auth check.
      "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
