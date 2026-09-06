// Enforces section 9's core principle: only the owner controls
// administrative functions, verified by Telegram user id (not a claim
// the user can type). Approved users get access to permitted features;
// everyone else can only request access.

import type { Context, NextFunction } from "grammy";
import { config } from "../config.ts";
import { isApprovedUser } from "../db.ts";

export function isOwner(ctx: Context): boolean {
  return ctx.from?.id === config.ownerId;
}

// Use as bot.command("publish", ownerOnly, handler)
export async function ownerOnly(ctx: Context, next: NextFunction): Promise<void> {
  if (!isOwner(ctx)) {
    await ctx.reply("This action is restricted to the bot owner.");
    return;
  }
  await next();
}

// Use for features gated behind an approved access request.
export async function approvedOnly(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === config.ownerId) {
    await next(); // owner is implicitly approved for everything
    return;
  }
  if (userId && (await isApprovedUser(userId))) {
    await next();
    return;
  }
  await ctx.reply(
    "You don't have access to this yet. Send /requestaccess to ask the owner for approval.",
  );
}
