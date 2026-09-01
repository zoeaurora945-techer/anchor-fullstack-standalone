import { ENV } from "./env";

/**
 * No-op notification - in standalone mode, notifications are logged to console.
 * In production you could integrate with email/SMS/Slack/webhooks.
 */
export type NotificationPayload = {
  title: string;
  content: string;
};

export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  // Log to console for now - in production add email/Slack/webhook
  console.log(`[Notification] ${payload.title}\n${payload.content}`);
  return true;
}
