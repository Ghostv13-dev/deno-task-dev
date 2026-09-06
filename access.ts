import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { config } from "../config.ts";
import { getAccessRequest, listPendingRequests, saveAccessRequest } from "../db.ts";
import type { AccessRequest } from "../types.ts";

export async function handleRequestAccess(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const existing = await getAccessRequest(userId);
  if (existing?.status === "approved") {
    await ctx.reply("You already have access.");
    return;
  }
  if (existing?.status === "pending") {
    await ctx.reply("Your access request is still pending owner approval.");
    return;
  }

  const req: AccessRequest = {
    userId,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    status: "pending",
    requestedAt: Date.now(),
  };
  await saveAccessRequest(req);

  await ctx.reply("Access request sent. You'll be notified once the owner reviews it.");

  const label = req.username ? `@${req.username}` : req.firstName ?? `user ${userId}`;
  const keyboard = new InlineKeyboard()
    .text("Approve", `access:approve:${userId}`)
    .text("Decline", `access:decline:${userId}`);
  await ctx.api.sendMessage(
    config.ownerId,
    `New access request from ${label} (id: ${userId}).`,
    { reply_markup: keyboard },
  );
}

export async function handleListRequests(ctx: Context): Promise<void> {
  const pending = await listPendingRequests();
  if (pending.length === 0) {
    await ctx.reply("No pending access requests.");
    return;
  }
  for (const req of pending) {
    const label = req.username ? `@${req.username}` : req.firstName ?? `user ${req.userId}`;
    const keyboard = new InlineKeyboard()
      .text("Approve", `access:approve:${req.userId}`)
      .text("Decline", `access:decline:${req.userId}`);
    await ctx.reply(`${label} (id: ${req.userId})`, { reply_markup: keyboard });
  }
}

// Handles the Approve/Decline inline button callback from the owner.
export async function handleAccessDecision(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const [, decision, userIdRaw] = data.split(":");
  const userId = Number(userIdRaw);
  if (!userId || (decision !== "approve" && decision !== "decline")) {
    await ctx.answerCallbackQuery();
    return;
  }

  const req = await getAccessRequest(userId);
  if (!req) {
    await ctx.answerCallbackQuery({ text: "Request no longer exists." });
    return;
  }

  req.status = decision === "approve" ? "approved" : "declined";
  req.decidedAt = Date.now();
  await saveAccessRequest(req);

  await ctx.answerCallbackQuery({ text: `Marked as ${req.status}.` });
  await ctx.editMessageText(
    `${req.username ? "@" + req.username : "User " + userId} — ${req.status}.`,
  );

  const message = req.status === "approved"
    ? "You've been approved. You can now use the bot's available features."
    : "Your access request was declined.";
  try {
    await ctx.api.sendMessage(userId, message);
  } catch {
    // user may have blocked the bot; nothing more we can do
  }
}
