import { supabase } from "@/integrations/supabase/client";

export type MediaFolder = "products" | "videos" | "welcome" | "faq" | "predefined";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/media-storage`;

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You must be signed in to upload media.");
  return { Authorization: `Bearer ${session.access_token}` };
}

/** Uploads a file to the business media storage and returns its public URL. */
export async function uploadMedia(file: File, folder: MediaFolder): Promise<string> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const fileName = `${folder}/${Date.now()}_${safeName}`;

  // 1. Primary: Direct Supabase Storage
  try {
    const { error: uploadError } = await supabase.storage.from("media").upload(fileName, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage.from("media").getPublicUrl(fileName);
      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    } else {
      console.warn("Direct storage upload failed, trying edge function fallback:", uploadError.message);
    }
  } catch (storageErr) {
    console.warn("Storage client error, trying edge function fallback:", storageErr);
  }

  // 2. Fallback: Edge Function
  const headers = await authHeader();
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const res = await fetch(`${FN_URL}?action=upload`, { method: "POST", headers, body: form });
  const text = await res.text();
  let payload: any = null;
  try { payload = JSON.parse(text); } catch { /* ignore */ }

  if (!res.ok) {
    throw new Error(payload?.error || `Upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return payload.url as string;
}

/** Deletes a previously uploaded file. Silently ignores files outside the business bucket. */
export async function deleteMedia(url: string): Promise<void> {
  try {
    if (url.includes("/storage/v1/object/public/media/")) {
      const path = url.split("/storage/v1/object/public/media/")[1];
      if (path) {
        await supabase.storage.from("media").remove([decodeURIComponent(path)]);
        return;
      }
    }

    const headers = await authHeader();
    await fetch(`${FN_URL}?action=delete`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (e) {
    console.warn("deleteMedia failed", e);
  }
}

