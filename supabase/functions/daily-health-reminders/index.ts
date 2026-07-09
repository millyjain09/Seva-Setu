import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withErrorCapture } from "../_shared/error-capture.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REMINDERS = [
  { title: "💊 Medication Reminder", body: "Time to take your daily medication. Stay consistent for better health!", icon_name: "Pill" },
  { title: "💧 Hydration Check", body: "Have you had enough water today? Aim for 8 glasses daily.", icon_name: "Droplets" },
  { title: "🩺 BP Check Reminder", body: "Don't forget to check your blood pressure today. Track it in Health Vault!", icon_name: "Heart" },
  { title: "🏃 Activity Reminder", body: "A 30-minute walk can do wonders for your health. Get moving!", icon_name: "Activity" },
  { title: "😴 Sleep Reminder", body: "Good sleep is essential for recovery. Aim for 7-8 hours tonight.", icon_name: "Moon" },
];

serve(withErrorCapture("daily-health-reminders", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all unique user_ids with push subscriptions
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("user_id");

    if (subErr) throw subErr;

    const uniqueUserIds = [...new Set(subs?.map((s: any) => s.user_id) ?? [])];

    if (uniqueUserIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users with push subscriptions", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pick today's reminder based on day of year
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    const reminder = REMINDERS[dayOfYear % REMINDERS.length];

    let totalSent = 0;
    let totalFailed = 0;

    // Send push to each user via the send-push function
    for (const userId of uniqueUserIds) {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: reminder.title,
            body: reminder.body,
          }),
        });

        const result = await response.json();
        totalSent += result.sent ?? 0;
        totalFailed += result.failed ?? 0;
      } catch (err) {
        console.error(`Failed to send to ${userId}:`, err);
        totalFailed++;
      }
    }

    console.log(`Daily reminders: ${totalSent} sent, ${totalFailed} failed, ${uniqueUserIds.length} users`);

    return new Response(
      JSON.stringify({
        reminder: reminder.title,
        users: uniqueUserIds.length,
        sent: totalSent,
        failed: totalFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
