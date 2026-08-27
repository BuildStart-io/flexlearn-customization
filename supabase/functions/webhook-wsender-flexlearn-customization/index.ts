import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function extractPhoneFromJid(jid: string): string {
  return String(jid || "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/^\+/, "")
    .replace(/[^\d]/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "flexlearn-customization" },
  });

  const correlationId = crypto.randomUUID();

  try {
    const body = await req.json();
    console.log(`[${correlationId}] [flexlearn-customization] WAHA webhook:`, JSON.stringify(body).substring(0, 600));

    const event = body?.event;
    const sessionName = body?.session;
    const wp = body?.payload || {};

    if (!sessionName) {
      return new Response(JSON.stringify({ error: "Missing session in payload" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const { data: sessionMapping } = await supabase
      .from("user_wsender_sessions")
      .select("user_id, session_id")
      .or(`session_id.eq.${sessionName},session_api_key.eq.${sessionName}`)
      .limit(1)
      .maybeSingle();

    const userId = sessionMapping?.user_id || null;

    if (event === "session.status") {
      console.log(`[${correlationId}] session.status for ${sessionName}: ${wp?.status}`);
      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    if (event !== "message" && event !== "message.any") {
      console.log(`[${correlationId}] Ignoring event: ${event}`);
      return new Response(JSON.stringify({ ok: true, skipped: event }), { headers: jsonHeaders });
    }

    if (wp?.fromMe === true) {
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe" }), { headers: jsonHeaders });
    }

    const fromJid = String(wp.from || wp._data?.key?.remoteJid || "");
    if (/@g\.us$/i.test(fromJid) || /@broadcast$/i.test(fromJid) || /@newsletter$/i.test(fromJid)) {
      return new Response(JSON.stringify({ ok: true, skipped: "non_individual" }), { headers: jsonHeaders });
    }

    let phoneNumber = "";

    if (/@lid$/i.test(fromJid)) {
      const wahaBase = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
      const wahaKey = Deno.env.get("WAHA_API_KEY") || "";
      try {
        const lidRes = await fetch(`${wahaBase}/api/${encodeURIComponent(sessionName)}/lids/${encodeURIComponent(fromJid)}`, {
          headers: { "X-Api-Key": wahaKey, Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (lidRes.ok) {
          const lidData = await lidRes.json();
          phoneNumber = extractPhoneFromJid(lidData?.pn || "");
          console.log(`[${correlationId}] Resolved ${fromJid} → ${phoneNumber || "(none)"}`);
        } else {
          console.warn(`[${correlationId}] LID lookup failed (${lidRes.status})`);
        }
      } catch (err) {
        console.warn(`[${correlationId}] LID lookup error:`, (err as Error).message);
      }
      if (!phoneNumber) phoneNumber = fromJid;
    } else {
      phoneNumber = extractPhoneFromJid(fromJid)
        || extractPhoneFromJid(wp._data?.key?.participantPn || "")
        || extractPhoneFromJid(wp._data?.key?.senderPn || "");
    }

    if (!phoneNumber) {
      console.warn(`[${correlationId}] Could not extract phone from`, fromJid);
      return new Response(JSON.stringify({ error: "No phone number" }), { status: 400, headers: jsonHeaders });
    }

    const messageText = wp.body
      || wp._data?.message?.conversation
      || wp._data?.message?.extendedTextMessage?.text
      || "";

    let messageType = "text";
    const wMsg = wp._data?.message || {};
    if (wMsg.imageMessage) messageType = "image";
    else if (wMsg.videoMessage) messageType = "video";
    else if (wMsg.audioMessage) messageType = wMsg.audioMessage?.ptt ? "ptt" : "audio";
    else if (wMsg.documentMessage) messageType = "document";
    else if (wMsg.stickerMessage) messageType = "sticker";
    else if (wMsg.locationMessage) messageType = "location";
    else if (wp.hasMedia && !messageText) messageType = "image";

    const senderName = wp._data?.pushName || wp._data?.notifyName || wp.notifyName || "Unknown";
    const wahaMessageId = wp.id || wp._data?.key?.id || `${phoneNumber}-${Date.now()}`;

    if (!userId) {
      console.error(`[${correlationId}] No user mapped to WAHA session "${sessionName}"`);
      return new Response(JSON.stringify({ error: "No user mapped to this session" }), {
        status: 200, headers: jsonHeaders,
      });
    }

    console.log(`[${correlationId}] Enqueue msg ${wahaMessageId} from ${phoneNumber} (${senderName}) → user ${userId}: ${messageText.substring(0, 80)}`);

    const { error: enqueueError } = await supabase
      .from("message_queue")
      .upsert(
        {
          wsender_message_id: wahaMessageId,
          user_id: userId,
          phone_number: phoneNumber,
          sender_name: senderName,
          message_text: messageText,
          message_type: messageType,
          session_api_key: sessionName,
          raw_payload: body,
          status: "pending",
          correlation_id: correlationId,
        },
        { onConflict: "wsender_message_id", ignoreDuplicates: true }
      );

    if (enqueueError) {
      if (enqueueError.code === "23505") {
        return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: jsonHeaders });
      }
      console.error(`[${correlationId}] Enqueue error:`, enqueueError);
      throw new Error("Failed to enqueue message");
    }

    fetch(`${supabaseUrl}/functions/v1/process-message-flexlearn-customization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ trigger: "webhook", correlationId }),
    }).catch((err) => {
      console.warn(`[${correlationId}] Trigger failed:`, err.message);
    });

    return new Response(
      JSON.stringify({ success: true, queued: true, messageId: wahaMessageId, correlationId }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    console.error(`[${correlationId}] Webhook error:`, error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
