import { Bot } from "grammy";
import { config } from "./config.ts";
import { isOwner, ownerOnly } from "./middleware/auth.ts";
// `approvedOnly` (from ./middleware/auth.ts) is available to gate any
// future feature behind the access-request flow — see section 10.
import {
  handleAddDestination,
  handleListDestinations,
  handleRemoveDestination,
} from "./features/destinations.ts";
import {
  cancelWizard,
  continuePublishWizard,
  startPublishWizard,
} from "./features/publish.ts";
import { handleChangeButton } from "./features/buttons.ts";
import { handleSchedule } from "./features/scheduling.ts";
import {
  handleAccessDecision,
  handleListRequests,
  handleRequestAccess,
} from "./features/access.ts";
import { maybeHandleGroupMention } from "./features/groupMention.ts";
import { handleUserMessage } from "./features/assistance.ts";

export const bot = new Bot(config.botToken);

// ---- Owner: control center (sections 6, 31) --------------------------------
bot.command("publish", ownerOnly, startPublishWizard);
bot.command("cancel", ownerOnly, cancelWizard);
bot.command("changebutton", ownerOnly, handleChangeButton);
bot.command("schedule", ownerOnly, handleSchedule);

bot.command("adddestination", ownerOnly, handleAddDestination);
bot.command("listdestinations", ownerOnly, handleListDestinations);
bot.command("removedestination", ownerOnly, handleRemoveDestination);

bot.command("requests", ownerOnly, handleListRequests);
bot.callbackQuery(/^access:(approve|decline):\d+$/, async (ctx) => {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: "Owner only." });
    return;
  }
  await handleAccessDecision(ctx);
});

// ---- Users: access requests + business assistance (sections 7, 3.8, 3.9) ---
bot.command("requestaccess", handleRequestAccess);

bot.command("start", async (ctx) => {
  if (isOwner(ctx)) {
    await ctx.reply(
      "Welcome back. Commands: /publish /schedule /changebutton /adddestination " +
        "/listdestinations /removedestination /requests",
    );
    return;
  }
  await ctx.reply(
    "Hi! Ask me about pricing or how to get started, or send /requestaccess for extended features.",
  );
});

// ---- Group mention assistance (sections 3.10, 8, 18) -----------------------
bot.on("message:text", async (ctx, next) => {
  if (await maybeHandleGroupMention(ctx)) return;
  await next();
});

// ---- Fallback text routing: owner wizard steps, then plain user chat -------
bot.on("message:text", async (ctx) => {
  if (ctx.chat.type !== "private") return; // group noise already filtered above

  if (isOwner(ctx)) {
    const handledByWizard = await continuePublishWizard(ctx);
    if (handledByWizard) return;
    // Owner sent plain text outside of any flow — no-op, avoid noisy replies.
    return;
  }

  // Basic business assistance (section 7) is open to anyone in a private
  // chat, matching the doc: users don't need approval just to say "hello".
  // Wrap specific commands with `approvedOnly` if you add gated features
  // that should require the access-request flow first.
  await handleUserMessage(ctx);
});

bot.catch((err) => {
  console.error("Bot error:", err.error);
});
