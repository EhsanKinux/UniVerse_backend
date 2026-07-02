import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendNotification, setVapidDetails } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/** The notification content sent to the browser (the SW reads this JSON). */
export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Where tapping the notification should open. */
  url?: string;
  /** Collapses/replaces earlier notifications with the same tag. */
  tag?: string;
}

export interface SaveSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  /** The logged-in owner of the device, or null for an anonymous browser. */
  userId?: string | null;
}

/** The subscription columns needed to actually send (a subset of the row). */
interface SendableSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends OS-level Web Push notifications. It configures web-push with the VAPID
 * keys at startup; if they're absent, push is simply disabled (the in-app SSE
 * notifications still work), so the app runs fine without push configured.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

    if (publicKey && privateKey) {
      try {
        setVapidDetails(subject, publicKey, privateKey);
        this.enabled = true;
        this.logger.log('Web Push enabled (VAPID configured).');
      } catch (error) {
        this.logger.error(
          `Web Push disabled — invalid VAPID config: ${String(error)}`,
        );
      }
    } else {
      this.logger.warn('Web Push disabled — VAPID keys are not set.');
    }
  }

  /** Whether push is configured — lets callers skip work when it can't send. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** The VAPID public key the browser needs to subscribe, or null if disabled. */
  getPublicKey(): string | null {
    return this.enabled
      ? (this.config.get<string>('VAPID_PUBLIC_KEY') ?? null)
      : null;
  }

  /** Upsert a subscription (re-subscribing the same device updates its keys). */
  async saveSubscription(input: SaveSubscriptionInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        userId: input.userId ?? null,
      },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        // The PWA re-subscribes on every open, so this tracks the device's
        // CURRENT login: set on sign-in, cleared back to null after logout.
        userId: input.userId ?? null,
      },
    });
  }

  async removeSubscription(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /**
   * Broadcast a notification to EVERY stored subscription (used for news).
   */
  async sendToAll(payload: PushNotificationPayload): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany();
    await this.sendToSubscriptions(subs, payload);
  }

  /**
   * Send a PERSONAL notification to every device the given user is logged in on
   * (used for class reminders). No-op if the user has no linked devices.
   */
  async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    await this.sendToSubscriptions(subs, payload);
  }

  /**
   * Encrypt + send to the given subscriptions. Failures for an individual
   * device never block the others; subscriptions the push service reports as
   * gone (404/410) are pruned so the table self-cleans.
   */
  private async sendToSubscriptions(
    subs: SendableSubscription[],
    payload: PushNotificationPayload,
  ): Promise<void> {
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    const stale: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          // 404 Not Found / 410 Gone = the subscription no longer exists.
          if (statusCode === 404 || statusCode === 410) {
            stale.push(sub.endpoint);
          } else {
            this.logger.warn(
              `Push send failed (${statusCode ?? 'network error'}).`,
            );
          }
        }
      }),
    );

    if (stale.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: stale } },
      });
      this.logger.log(`Pruned ${stale.length} stale push subscription(s).`);
    }
  }
}
