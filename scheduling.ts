import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  indexButton,
  listDestinations,
  listDuePosts,
  markScheduledPublished,
  saveScheduledPost,
  savePost,
} from "../db.ts";
import type { InlineButtonRef, Post, PublishedMessageRef, ScheduledPost } from "../types.ts";

// /schedule <YYYY-MM-DDTHH:mm> | <destination ids comma-separated> | <text>
// Kept as a single-line command (rather than a wizard) since schedules are
// often prepared ahead of time and copy-pasted from notes.
export async function handleSchedule(ctx: Context): Promise<void> {
  const raw = ctx.match?.toString() ?? "";
  const [whenRaw, destRaw, ...rest] = raw.split("|").map((p) => p.trim());
  const text = rest.join("|").trim();

  if (!whenRaw || !destRaw || !text) {
    await ctx.reply(
      "Usage: /schedule <YYYY-MM-DDTHH:mm> | <destination ids, comma-separated> | <message text>",
    );
    return;
  }

  const publishAt = new Date(whenRaw).getTime();
  if (Number.isNaN(publishAt)) {
    await ctx.reply("Couldn't parse that date/time. Use format 2026-09-10T10:00");
    return;
  }

  const destinationIds = destRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const sp: ScheduledPost = {
    id: `sched-${Date.now()}`,
    text,
    buttons: [], // extend here if scheduled posts need buttons too
    destinations: destinationIds,
    publishAt,
    published: false,
    createdAt: Date.now(),
  };
  await saveScheduledPost(sp);

  await ctx.reply(
    `Scheduled for ${new Date(publishAt).toLocaleString()}. Id: ${sp.id}`,
  );
}

// Publishes anything whose time has come. Called by the cron job in main.ts.
export async function runDuePublications(bot: Bot): Promise<void> {
  const due = await listDuePosts(Date.now());
  if (due.length === 0) return;

  const allDestinations = await listDestinations();

  for (const sp of due) {
    const targets = allDestinations.filter((d) => sp.destinations.includes(d.id));
    const publishedMessages: PublishedMessageRef[] = [];
    const keyboard = sp.buttons.length > 0 ? buildKeyboard(sp.buttons) : undefined;

    for (const dest of targets) {
      try {
        const sent = await bot.api.sendMessage(dest.chatId, sp.text, {
          reply_markup: keyboard,
        });
        publishedMessages.push({ chatId: dest.chatId, messageId: sent.message_id });
      } catch (err) {
        console.error(`Scheduled publish failed for ${sp.id} -> ${dest.chatId}:`, err);
      }
    }

    const post: Post = {
      id: `post-${sp.id}`,
      text: sp.text,
      buttons: sp.buttons,
      destinations: sp.destinations,
      publishedMessages,
      createdAt: Date.now(),
    };
    await savePost(post);
    for (const b of sp.buttons) await indexButton(b.id, post.id);

    await markScheduledPublished(sp.id);
  }
}

function buildKeyboard(buttons: InlineButtonRef[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of buttons) kb.url(b.text, b.url).row();
  return kb;
}
