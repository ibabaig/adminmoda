import type { Db } from "@/lib/crud";

export const BUCKET = "museum-images";
export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
] as const;

export type ImageRow = {
  id: number;
  bucket: string;
  path: string;
  kind: string;
  alt_text: string | null;
  caption: string | null;
  content_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  work_id: number | null;
  uploaded_by: string | null;
  created_at: string;
};

const COLS =
  "id, bucket, path, kind, alt_text, caption, content_type, byte_size, width, height, work_id, uploaded_by, created_at";

export async function listImages(db: Db): Promise<ImageRow[]> {
  const { data, error } = await db
    .from("images")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Could not list images: ${error.message}`);
  return (data ?? []) as unknown as ImageRow[];
}

export async function getImage(db: Db, id: number): Promise<ImageRow | null> {
  const { data, error } = await db.from("images").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load that image: ${error.message}`);
  return (data as unknown as ImageRow) ?? null;
}

export function publicUrl(row: Pick<ImageRow, "bucket" | "path">): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${row.bucket}/${row.path}`;
}

// A filename safe to put in a URL, keeping enough of the original that a
// curator can still recognise the file in a listing.
function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const ext = (dot > 0 ? name.slice(dot + 1) : "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const stamp = Date.now().toString(36);
  return `${stem || "image"}-${stamp}.${ext || "bin"}`;
}

export type UploadInput = {
  file: File;
  kind: string;
  altText: string | null;
  caption: string | null;
  workId: number | null;
  uploadedBy: string;
};

// Bytes go to Storage; the database gets a PATH. Assignment 3 said it
// outright — binary image data does not belong in a relational column —
// and it is still true here. This table is the catalogue entry, and
// deleting a row without deleting the object would leave a file nobody
// can find.
export async function uploadImage(db: Db, input: UploadInput): Promise<number> {
  const { file } = input;

  if (!file || file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit here is 5MB.`
    );
  }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    throw new Error(
      `${file.type || "That file type"} is not accepted. Use PNG, JPEG, WebP, GIF or SVG.`
    );
  }

  const path = `${input.kind}/${safeName(file.name)}`;

  const up = await db.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

  const { data, error } = await db
    .from("images")
    .insert({
      bucket: BUCKET,
      path,
      kind: input.kind,
      alt_text: input.altText,
      caption: input.caption,
      content_type: file.type,
      byte_size: file.size,
      work_id: input.workId,
      uploaded_by: input.uploadedBy,
    })
    .select("id")
    .single();

  if (error) {
    // The object is already in Storage. Leaving it there with no
    // catalogue row would be an orphan nobody can find, so undo it.
    await db.storage.from(BUCKET).remove([path]);
    throw new Error(`Uploaded, but could not catalogue it: ${error.message}`);
  }

  return (data as { id: number }).id;
}

export async function updateImage(
  db: Db,
  id: number,
  patch: { kind: string; alt_text: string | null; caption: string | null; work_id: number | null }
) {
  const { error } = await db.from("images").update(patch).eq("id", id);
  if (error) throw new Error(`Could not save: ${error.message}`);
}

// Row and object together, object first. If the object delete fails the
// row survives, which is the recoverable direction: a catalogue entry
// pointing at a file that is still there beats a file nobody can reach.
export async function deleteImage(db: Db, id: number) {
  const row = await getImage(db, id);
  if (!row) throw new Error("That image is already gone.");

  const rm = await db.storage.from(row.bucket).remove([row.path]);
  if (rm.error) throw new Error(`Could not remove the file: ${rm.error.message}`);

  const { error } = await db.from("images").delete().eq("id", id);
  if (error) throw new Error(`File removed, but the catalogue row remains: ${error.message}`);
}
