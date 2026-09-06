// Central place for environment configuration. Fails fast if required
// variables are missing so misconfiguration is caught at boot, not at runtime.

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  ownerId: Number(required("OWNER_ID")),
  webhookSecret: required("WEBHOOK_SECRET"),
  publicUrl: Deno.env.get("PUBLIC_URL") ?? "",
};
