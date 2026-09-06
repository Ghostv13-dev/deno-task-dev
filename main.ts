// Entry point. Runs an HTTPS-reachable webhook server (deployable to Deno
// Deploy or any Deno host) and a background cron job that publishes due
// scheduled posts (sections 16, 17, 20, 25).

import { webhookCallback } from "grammy";
import { bot } from "./src/bot.ts";
import { config } from "./src/config.ts";
import { runDuePublications } from "./src/features/scheduling.ts";

const handleUpdate = webhookCallback(bot, "std/http");

// Check scheduled posts every minute. Deno.cron keeps this running even
// on serverless platforms that would otherwise sleep between requests.
Deno.cron("publish due scheduled posts", "* * * * *", async () => {
  try {
    await runDuePublications(bot);
  } catch (err) {
    console.error("Scheduled publish check failed:", err);
  }
});

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Webhook path includes the secret so only Telegram (who we told the
  // secret) can trigger updates — see section 21, "permanent bot address".
  if (url.pathname === `/webhook/${config.webhookSecret}` && req.method === "POST") {
    try {
      return await handleUpdate(req);
    } catch (err) {
      console.error("Webhook handling error:", err);
      return new Response("error", { status: 500 });
    }
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response("Telegram-Bot is running.", { status: 200 });
  }

  return new Response("Not found", { status: 404 });
});
