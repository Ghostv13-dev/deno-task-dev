import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { findPostsForButton, savePost } from "../db.ts";
import type { InlineButtonRef, Post } from "../types.ts";

function rebuildKeyboard(buttons: InlineButtonRef[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of buttons) kb.url(b.text, b.url).row();
  return kb;
}

// /changebutton <buttonId> <newUrl>
// Finds every published message that used this button and edits its
// reply markup in place, so old posts stay current without recreating them.
export async function handleChangeButton(ctx: Context): Promise<void> {
  const args = ctx.match?.toString().trim().split(/\s+/) ?? [];
  const [buttonId, newUrl] = args;
  if (!buttonId || !newUrl) {
    await ctx.reply("Usage: /changebutton <buttonId> <newUrl>");
    return;
  }

  const posts = await findPostsForButton(buttonId);
  if (posts.length === 0) {
    await ctx.reply(`No published posts found using button id "${buttonId}".`);
    return;
  }

  let updatedMessages = 0;
  for (const post of posts) {
    const button = post.buttons.find((b) => b.id === buttonId);
    if (!button) continue;
    button.url = newUrl;

    const keyboard = rebuildKeyboard(post.buttons);
    for (const ref of post.publishedMessages) {
      try {
        await ctx.api.editMessageReplyMarkup(ref.chatId, ref.messageId, {
          reply_markup: keyboard,
        });
        updatedMessages++;
      } catch (err) {
        console.error(`Failed to update message ${ref.messageId} in ${ref.chatId}:`, err);
      }
    }
    await savePost(post as Post);
  }

  await ctx.reply(
    `Updated button "${buttonId}" to ${newUrl} across ${updatedMessages} message(s) in ${posts.length} post(s).`,
  );
}
