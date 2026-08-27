import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    db: { schema: "flexlearn-customization" },
  });

  try {
    const now = new Date().toISOString();

    const { data: candidates, error: fetchError } = await supabase
      .from("scheduled_messages")
      .select("id, campaign_id, user_id, customer_name, phone_number, message, scheduled_at, status")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error("[send-scheduled-flexlearn-customization] Error fetching scheduled messages:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No messages to dispatch" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[send-scheduled-flexlearn-customization] Found ${candidates.length} messages to dispatch`);
    let sentCount = 0;
    let failedCount = 0;

    for (const item of candidates) {
      const { data: campaign } = await supabase
        .from("scheduled_campaigns")
        .select("status, title")
        .eq("id", item.campaign_id)
        .maybeSingle();

      if (!campaign || campaign.status === "paused" || campaign.status === "cancelled") {
        console.log(`[send-scheduled-flexlearn-customization] Skipping message ${item.id} - campaign status is ${campaign?.status || "missing"}`);
        continue;
      }

      if (campaign.status === "scheduled") {
        await supabase
          .from("scheduled_campaigns")
          .update({ status: "running", updated_at: new Date().toISOString() })
          .eq("id", item.campaign_id);
      }

      const { data: sessionData } = await supabase
        .from("user_wsender_sessions")
        .select("session_api_key")
        .eq("user_id", item.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sessionApiKey = sessionData?.session_api_key || null;

      try {
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-flexlearn-customization`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: item.phone_number,
            message: item.message,
            sessionApiKey,
          }),
        });

        if (!sendRes.ok) {
          const errText = await sendRes.text();
          throw new Error(`WhatsApp send error: ${errText}`);
        }

        await supabase.from("conversations").insert({
          user_id: item.user_id,
          phone_number: item.phone_number,
          message: item.message,
          direction: "outbound",
          metadata: {
            type: "scheduled_broadcast",
            campaign_id: item.campaign_id,
            campaign_title: campaign.title,
          },
        });

        await supabase
          .from("scheduled_messages")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        const { data: currentCamp } = await supabase
          .from("scheduled_campaigns")
          .select("sent_count, total_recipients")
          .eq("id", item.campaign_id)
          .single();

        if (currentCamp) {
          const newSent = (currentCamp.sent_count || 0) + 1;
          const isComplete = newSent >= (currentCamp.total_recipients || 0);
          await supabase
            .from("scheduled_campaigns")
            .update({
              sent_count: newSent,
              status: isComplete ? "completed" : "running",
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.campaign_id);
        }

        sentCount++;
        console.log(`[send-scheduled-flexlearn-customization] Dispatched message ${item.id} to ${item.phone_number}`);
      } catch (err: any) {
        console.error(`[send-scheduled-flexlearn-customization] Failed to send message ${item.id}:`, err);
        failedCount++;

        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            error_message: err.message || "Unknown delivery error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        const { data: currentCamp } = await supabase
          .from("scheduled_campaigns")
          .select("failed_count, sent_count, total_recipients")
          .eq("id", item.campaign_id)
          .single();

        if (currentCamp) {
          const newFailed = (currentCamp.failed_count || 0) + 1;
          const totalProcessed = (currentCamp.sent_count || 0) + newFailed;
          const isComplete = totalProcessed >= (currentCamp.total_recipients || 0);
          await supabase
            .from("scheduled_campaigns")
            .update({
              failed_count: newFailed,
              status: isComplete ? "completed" : "running",
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.campaign_id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (globalError: any) {
    console.error("[send-scheduled-flexlearn-customization] Global error:", globalError);
    return new Response(JSON.stringify({ error: globalError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
