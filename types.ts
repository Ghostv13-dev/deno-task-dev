// Domain types shared across features.

export interface Destination {
  id: string; // internal short id, e.g. "main-channel"
  chatId: number; // Telegram chat id (channel or group)
  label: string; // human friendly name shown to the owner
  addedAt: number;
}

export interface InlineButtonRef {
  id: string; // internal id used to find/replace this button later
  text: string;
  url: string;
}

export interface PublishedMessageRef {
  chatId: number;
  messageId: number;
}

export interface Post {
  id: string;
  text: string;
  buttons: InlineButtonRef[]; // buttons as originally configured
  destinations: string[]; // Destination ids
  publishedMessages: PublishedMessageRef[]; // where it actually landed
  createdAt: number;
}

export interface ScheduledPost {
  id: string;
  text: string;
  buttons: InlineButtonRef[];
  destinations: string[];
  publishAt: number; // epoch ms
  published: boolean;
  createdAt: number;
}

export type AccessStatus = "pending" | "approved" | "declined";

export interface AccessRequest {
  userId: number;
  username?: string;
  firstName?: string;
  status: AccessStatus;
  requestedAt: number;
  decidedAt?: number;
}

export interface ConversationState {
  // Generic scratch space for multi-step owner flows (publish wizard, etc).
  step: string;
  data: Record<string, unknown>;
  updatedAt: number;
}
