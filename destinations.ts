import type { Context } from "grammy";
import { addDestination, listDestinations, removeDestination } from "../db.ts";
import type { Destination } from "../types.ts";

// /adddestination <label>  -- run this command *inside* the channel/group
// you want to connect (as a forward, or by adding the bot as admin there
// and using it there directly).
export async function handleAddDestination(ctx: Context): Promise<void> {
  const label = ctx.match?.toString().trim();
  if (!label) {
    await ctx.reply("Usage: /adddestination <label>\nRun this inside the channel or group you want to connect.");
    return;
  }
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || `dest-${Date.now()}`;
  const dest: Destination = { id, chatId, label, addedAt: Date.now() };
  await addDestination(dest);
  await ctx.reply(`Connected "${label}" as destination id "${id}".`);
}

export async function handleListDestinations(ctx: Context): Promise<void> {
  const dests = await listDestinations();
  if (dests.length === 0) {
    await ctx.reply("No destinations connected yet. Use /adddestination inside a channel or group.");
    return;
  }
  const lines = dests.map((d) => `• ${d.label} (id: ${d.id}, chat: ${d.chatId})`);
  await ctx.reply(`Connected destinations:\n${lines.join("\n")}`);
}

export async function handleRemoveDestination(ctx: Context): Promise<void> {
  const id = ctx.match?.toString().trim();
  if (!id) {
    await ctx.reply("Usage: /removedestination <id>");
    return;
  }
  await removeDestination(id);
  await ctx.reply(`Removed destination "${id}".`);
}
