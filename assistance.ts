import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";

export interface AssistanceReply {
  reply: string;
  buttons?: { text: string; url: string }[];
}

// A minimal keyword-matched FAQ. This is intentionally simple and data-driven
// so the owner can extend it without touching bot logic — swap this for a
// call to an LLM or a CMS lookup as the business grows.
const FAQ: { keywords: string[]; reply: string; buttons?: { text: string; url: string }[] }[] = [
  {
    keywords: ["price", "cost", "how much"],
    reply: "Here's our current pricing information.",
    buttons: [{ text: "View pricing", url: "https://example.com/pricing" }],
  },
  {
    keywords: ["info", "information", "more information", "details"],
    reply: "Happy to help — here's more information about us.",
    buttons: [{ text: "Learn more", url: "https://example.com/about" }],
  },
  {
    keywords: ["contact", "support", "help me", "human"],
    reply: "You can reach our support team directly here.",
    buttons: [{ text: "Contact us", url: "https://example.com/contact" }],
  },
  {
    keywords: ["hello", "hi", "hey"],
    reply: "Hello! Ask me about pricing, our services, or how to get started.",
  },
];

export function answerBusinessQuestion(question: string): AssistanceReply {
  const q = question.toLowerCase();
  for (const entry of FAQ) {
    if (entry.keywords.some((kw) => q.includes(kw))) {
      return { reply: entry.reply, buttons: entry.buttons };
    }
  }
  return {
    reply: "Thanks for your message! Ask about pricing, more information, or contact support.",
  };
}

// Handles a plain private-chat message from a normal (non-owner) user.
export async function handleUserMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const { reply, buttons } = answerBusinessQuestion(text);
  const keyboard = buttons?.length
    ? buttons.reduce((kb, b) => kb.url(b.text, b.url).row(), new InlineKeyboard())
    : undefined;
  await ctx.reply(reply, { reply_markup: keyboard });
}
