import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { answerBusinessQuestion } from "./assistance.ts";

// Only responds in group/supergroup chats, and only when the bot's own
// @username is actually mentioned in the message text — it deliberately
// ignores the rest of group conversation (section 8: "does not need to
// respond to every conversation").
export async function maybeHandleGroupMention(ctx: Context): Promise<boolean> {
  const chatType = ctx.chat?.type;
  if (chatType !== "group" && chatType !== "supergroup") return false;

  const text = ctx.message?.text ?? "";
  const botUsername = ctx.me?.username;
  if (!botUsername || !text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
    return false;
  }

  const question = text.replace(new RegExp(`@${botUsername}`, "ig"), "").trim();
  const { reply, buttons } = answerBusinessQuestion(question);

  const keyboard = buttons?.length
    ? buttons.reduce((kb, b) => kb.url(b.text, b.url).row(), new InlineKeyboard())
    : undefined;

  const replyToId = ctx.message?.message_id;
  await ctx.reply(reply, {
    reply_markup: keyboard,
    ...(replyToId ? { reply_parameters: { message_id: replyToId } } : {}),
  });
  return true;
}
