import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const WAHA_BASE = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
const WAHA_KEY = Deno.env.get("WAHA_API_KEY") || "";

async function wahaFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const headers = new Headers(init.headers || {});
  if (WAHA_KEY) headers.set("X-Api-Key", WAHA_KEY);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const { timeoutMs, ...rest } = init;
  return fetch(`${WAHA_BASE}${path}`, {
    ...rest,
    headers,
    signal: init.signal || AbortSignal.timeout(timeoutMs ?? 30_000),
  });
}

function wahaFireAndForget(path: string, method: string, timeoutMs = 25_000) {
  return wahaFetch(path, { method, timeoutMs }).then(
    (r) => r.status,
    (e) => { console.warn("waha bg call failed", path, String(e)); return 0; },
  );
}

async function safeReadJson(res: Response) {
  const txt = await res.text();
  if (!txt.trim()) return null;
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

async function readQrResponse(qrRes: Response): Promise<{ qrImage: string | null; qrCode: string | null }> {
  const contentType = (qrRes.headers.get("content-type") || "").toLowerCase();
  const rawBytes = new Uint8Array(await qrRes.arrayBuffer());

  if (contentType.includes("image/png") || isPng(rawBytes)) {
    return { qrImage: `data:image/png;base64,${bytesToBase64(rawBytes)}`, qrCode: null };
  }

  const text = new TextDecoder().decode(rawBytes).trim();
  if (!text) return { qrImage: null, qrCode: null };

  try {
    const json = JSON.parse(text);
    if (json.value) return { qrImage: null, qrCode: json.value };
    if (json.data?.value) return { qrImage: null, qrCode: json.data.value };
    if (json.data?.qr) return { qrImage: null, qrCode: json.data.qr };
    if (typeof json === "string") return { qrImage: null, qrCode: json };
  } catch {
    if (text.startsWith("data:image/")) return { qrImage: text, qrCode: null };
    if (text.startsWith("1@") || text.length > 20) return { qrImage: null, qrCode: text };
  }
  return { qrImage: null, qrCode: null };
}

function mapWahaStatus(status?: string): "connected" | "disconnected" | "qrcode" | "STARTING" {
  switch (status) {
    case "WORKING":
      return "connected";
    case "SCAN_QR_CODE":
      return "qrcode";
    case "STARTING":
      return "STARTING";
    case "STOPPED":
    case "FAILED":
    default:
      return "disconnected";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: "flexlearn_customization" },
    });

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401, headers: jsonHeaders });
    }
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: "flexlearn_customization" },
      db: { schema: "flexlearn_customization" },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    const sessionName = `u_${userId.replace(/-/g, "").substring(0, 20)}`;
    let webhookUrl = Deno.env.get("WEBHOOK_URL_OVERRIDE") || `${supabaseUrl}/functions/v1/webhook-wsender-flexlearn-customization`;
    if (webhookUrl.includes("webhook-wsender") && !webhookUrl.includes("webhook-wsender-flexlearn-customization")) {
      webhookUrl = webhookUrl.replace("webhook-wsender", "webhook-wsender-flexlearn-customization");
    }

    const upsertMapping = async (displayName?: string) => {
      await supabase.from("user_wsender_sessions").upsert(
        {
          user_id: userId,
          session_id: sessionName,
          session_name: displayName || sessionName,
          session_api_key: sessionName,
        } as any,
        { onConflict: "user_id,session_id" }
      );
    };

    switch (action) {
      case "list-sessions": {
        const sres = await wahaFetch(`/api/sessions/${sessionName}`);
        if (sres.status === 404) {
          return new Response(JSON.stringify({ data: [] }), { headers: jsonHeaders });
        }
        const sdata = await safeReadJson(sres);
        const status = mapWahaStatus(sdata?.status);
        const phone = sdata?.me?.id ? String(sdata.me.id).split("@")[0] : "";
        return new Response(JSON.stringify({
          data: [{
            id: sessionName,
            name: sdata?.name || sessionName,
            status,
            phone,
          }],
        }), { headers: jsonHeaders });
      }

      case "create-session": {
        const body = await req.json().catch(() => ({}));
        const displayName = body?.name || "WhatsApp";

        const sessionConfig = {
          noweb: { store: { enabled: true, fullSync: true } },
          webhooks: [{
            url: webhookUrl,
            events: ["message", "session.status"],
            retries: { policy: "linear", delaySeconds: 2, attempts: 3 },
          }],
        };

        const existingRes = await wahaFetch(`/api/sessions/${sessionName}`, { timeoutMs: 20_000 })
          .catch(() => null);
        const exists = !!existingRes && existingRes.status !== 404;
        if (existingRes) await existingRes.body?.cancel().catch(() => {});

        if (exists) {
          await wahaFetch(`/api/sessions/${sessionName}`, {
            method: "PUT",
            body: JSON.stringify({ config: sessionConfig }),
            timeoutMs: 25_000,
          }).catch(() => null);
          const restartRes = await wahaFetch(`/api/sessions/${sessionName}/restart`, {
            method: "POST",
            timeoutMs: 40_000,
          }).catch(() => null);
          if (!restartRes || !restartRes.ok) {
            await wahaFetch(`/api/sessions/${sessionName}/start`, { method: "POST", timeoutMs: 40_000 })
              .catch(() => null);
          }
          await upsertMapping(displayName);
          return new Response(JSON.stringify({ data: { id: sessionName, name: displayName, reused: true } }), { headers: jsonHeaders });
        }

        const createRes = await wahaFetch(`/api/sessions`, {
          method: "POST",
          timeoutMs: 45_000,
          body: JSON.stringify({ name: sessionName, start: true, config: sessionConfig }),
        });
        const createData = await safeReadJson(createRes);
        if (!createRes.ok) {
          if (createRes.status === 422) {
            await wahaFetch(`/api/sessions/${sessionName}/start`, { method: "POST", timeoutMs: 40_000 }).catch(() => null);
          } else {
            const detail = createData?.message || createData?.error || createData?.raw;
            throw new Error(
              detail
                ? `WhatsApp server error (${createRes.status}): ${String(detail).slice(0, 200)}`
                : `WhatsApp server rejected the request (${createRes.status}). It may be overloaded — try again in a moment.`,
            );
          }
        }

        await upsertMapping(displayName);

        return new Response(JSON.stringify({ data: { id: sessionName, name: displayName } }), { headers: jsonHeaders });
      }

      case "session-details": {
        const sres = await wahaFetch(`/api/sessions/${sessionName}`);
        const sdata = await safeReadJson(sres);
        return new Response(JSON.stringify({
          data: {
            id: sessionName,
            api_key: sessionName,
            status: mapWahaStatus(sdata?.status),
            phone: sdata?.me?.id ? String(sdata.me.id).split("@")[0] : "",
          },
        }), { headers: jsonHeaders });
      }

      case "initialize": {
        const statusRes = await wahaFetch(`/api/sessions/${sessionName}`);
        if (statusRes.status === 404) {
          return new Response(JSON.stringify({ error: "Session not found. Delete it and create a new session." }), { status: 404, headers: jsonHeaders });
        }
        const statusData = await safeReadJson(statusRes);
        if (["STOPPED", "FAILED"].includes(statusData?.status)) {
          const startRes = await wahaFetch(`/api/sessions/${sessionName}/start`, { method: "POST" });
          if (!startRes.ok) {
            const startData = await safeReadJson(startRes);
            throw new Error(startData?.message || startData?.error || `WAHA start failed (${startRes.status})`);
          }
        }
        return new Response(JSON.stringify({ data: { ok: true, status: mapWahaStatus(statusData?.status) } }), { headers: jsonHeaders });
      }

      case "get-qr": {
        let qrImage: string | null = null;
        let qrCode: string | null = null;
        let status = "STARTING";
        for (let i = 0; i < 12; i++) {
          const sres = await wahaFetch(`/api/sessions/${sessionName}`);
          if (sres.status === 404) {
            return new Response(JSON.stringify({ error: "Session not found. Delete it and create a new session." }), { status: 404, headers: jsonHeaders });
          }
          const sdata = await safeReadJson(sres);
          status = sdata?.status || status;
          if (status === "WORKING") {
            return new Response(JSON.stringify({ data: { qrImage: null, qrCode: null, status: "connected" } }), { headers: jsonHeaders });
          }
          if (["STOPPED", "FAILED"].includes(status)) {
            const startRes = await wahaFetch(`/api/sessions/${sessionName}/start`, {
              method: "POST",
              timeoutMs: 40_000,
            }).catch(() => null);
            if (!startRes?.ok) {
              console.warn("WAHA session start failed while requesting QR", sessionName, startRes?.status || 0);
            }
          }
          if (status === "SCAN_QR_CODE") {
            const qrRes = await wahaFetch(`/api/${sessionName}/auth/qr?format=image`);
            if (qrRes.ok) {
              const parsedQr = await readQrResponse(qrRes);
              qrImage = parsedQr.qrImage;
              qrCode = parsedQr.qrCode;
              if (qrImage || qrCode) break;
            } else {
              await qrRes.body?.cancel().catch(() => {});
              console.warn("WAHA QR endpoint returned", qrRes.status, sessionName);
            }
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        return new Response(JSON.stringify({
          data: { qrImage, qrCode, status: mapWahaStatus(status) },
        }), { headers: jsonHeaders });
      }

      case "set-webhook": {
        return new Response(JSON.stringify({ data: { ok: true } }), { headers: jsonHeaders });
      }

      case "delete-session": {
        await supabase.from("user_wsender_sessions")
          .delete()
          .eq("user_id", userId)
          .eq("session_id", sessionName);

        const teardown = (async () => {
          await wahaFireAndForget(`/api/sessions/${sessionName}/logout`, "POST");
          await wahaFireAndForget(`/api/sessions/${sessionName}/stop`, "POST");
          const code = await wahaFireAndForget(`/api/sessions/${sessionName}`, "DELETE", 60_000);
          console.log("WAHA teardown", sessionName, "delete status", code);
        })();

        const finished = await Promise.race([
          teardown.then(() => true),
          new Promise<boolean>((r) => setTimeout(() => r(false), 8_000)),
        ]);
        if (!finished) {
          // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
          try { EdgeRuntime.waitUntil(teardown); } catch { /* noop */ }
        }

        return new Response(JSON.stringify({ data: { ok: true, background: !finished } }), { headers: jsonHeaders });
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: list-sessions, create-session, session-details, initialize, get-qr, set-webhook, delete-session" }),
          { status: 400, headers: jsonHeaders }
        );
    }
  } catch (error) {
    console.error("waha-sessions error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
