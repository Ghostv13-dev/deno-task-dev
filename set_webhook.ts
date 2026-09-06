// Run once after deploying: deno task setwebhook
// Tells Telegram where to POST updates for this bot.

import { config } from "../src/config.ts";

if (!config.publicUrl) {
  console.error("Set PUBLIC_URL in your environment before running this script.");
  Deno.exit(1);
}

const webhookUrl = `${config.publicUrl}/webhook/${config.webhookSecret}`;

const res = await fetch(
  `https://api.telegram.org/bot${config.botToken}/setWebhook`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  },
);

const data = await res.json();
console.log(data.ok ? `Webhook set to ${webhookUrl}` : data);
