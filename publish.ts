import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { indexButton, listDestinations, savePost } from "../db.ts";
import {
  clearConversationState,
  getConversationState,
  setConversationState,
} from "../db.ts";
import type { InlineButtonRef, Post, PublishedMessageRef } from "../types.ts";

// Builds a grammY InlineKeyboard from our button refs, one per row for clarity.
function buildKeyboard(buttons: InlineButtonRef[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of buttons) {
    kb.url(b.text, b.url).row();
  }
  return kb;
}

// Publishes text + buttons to every destination id given, recording exactly
// where each message landed so buttons can be updated later (section 14).
export async function publishToDestinations(
  ctx: Context,
  text: string,
  buttons: InlineButtonRef[],
  destinationIds: string[],
): Promise<Post> {
  const allDestinations = await listDestinations();
  const targets = allDestinations.filter((d) => destinationIds.includes(d.id));

  const publishedMessages: PublishedMessageRef[] = [];
  const keyboard = buttons.length > 0 ? buildKeyboard(buttons) : undefined;

  for (const dest of targets) {
    const sent = await ctx.api.sendMessage(dest.chatId, text, {
      reply_markup: keyboard,
    });
    publishedMessages.push({ chatId: dest.chatId, messageId: sent.message_id });
  }

  const post: Post = {
    id: `post-${Date.now()}`,
    text,
    buttons,
    destinations: destinationIds,
    publishedMessages,
    createdAt: Date.now(),
  };
  await savePost(post);

  for (const b of buttons) {
    await indexButton(b.id, post.id);
  }

  return post;
}

// --- Simple conversational publish wizard -----------------------------------
// /publish starts a short guided flow: text -> buttons (optional) -> destinations.

export async function startPublishWizard(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  await setConversationState(userId, {
    step: "awaiting_text",
    data: {},
    updatedAt: Date.now(),
  });
  await ctx.reply(
    "Let's publish something. Send the message text now (or /cancel to stop).",
  );
}

export async function cancelWizard(ctx: Context): Promise<void> {
  await clearConversationState(ctx.from!.id);
  await ctx.reply("Cancelled.");
}

// Called from the main message handler when a conversation is in progress.
export async function continuePublishWizard(ctx: Context): Promise<boolean> {
  const userId = ctx.from!.id;
  const state = await getConversationState(userId);
  if (!state || !state.step.startsWith("awaiting_")) return false;

  const text = ctx.message?.text ?? "";

  if (state.step === "awaiting_text") {
    state.data.text = text;
    state.step = "awaiting_buttons";
    state.updatedAt = Date.now();
    await setConversationState(userId, state);
    await ctx.reply(
      'Add a button? Send "Label | https://example.com", multiple lines for multiple buttons, or send "no" to skip.',
    );
    return true;
  }

  if (state.step === "awaiting_buttons") {
    const buttons: InlineButtonRef[] = [];
    if (text.trim().toLowerCase() !== "no") {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const [label, url] = line.split("|").map((p) => p.trim());
        if (label && url) {
          buttons.push({ id: `btn-${Date.now()}-${buttons.length}`, text: label, url });
        }
      }
    }
    state.data.buttons = buttons;
    state.step = "awaiting_destinations";
    state.updatedAt = Date.now();
    await setConversationState(userId, state);

    const dests = await listDestinations();
    const list = dests.map((d) => `${d.id}`).join(", ") || "(none connected)";
    await ctx.reply(
      `Which destinations? Comma-separated ids from: ${list}\n(or "all")`,
    );
    return true;
  }

  if (state.step === "awaiting_destinations") {
    const dests = await listDestinations();
    let destinationIds: string[];
    if (text.trim().toLowerCase() === "all") {
      destinationIds = dests.map((d) => d.id);
    } else {
      destinationIds = text.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const post = await publishToDestinations(
      ctx,
      state.data.text as string,
      state.data.buttons as InlineButtonRef[],
      destinationIds,
    );

    await clearConversationState(userId);
    await ctx.reply(
      `Published to ${post.publishedMessages.length} location(s). Post id: ${post.id}`,
    );
    return true;
  }

  return false;
}
