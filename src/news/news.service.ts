import {
  BadRequestException,
  Injectable,
  type MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { CALENDAR_TIME_ZONE } from '../calendar/jalali.util';
import { News } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { isKnownNewsCategory, newsCategoryLabel } from './dto/news-categories';
import { NewsDto, NewsStreamEvent, NewsStreamType } from './dto/news.dto';

/** The plain form fields for creating/updating a news item. */
export interface NewsInput {
  title?: string;
  category?: string;
  body?: string;
  link?: string | null;
  pinned?: boolean;
  isPublished?: boolean;
}

// How often to emit a keep-alive on the SSE stream. Without it, idle proxies can
// silently drop the connection; the browser would reconnect, but a heartbeat
// keeps it healthy in the first place. The client ignores these.
const HEARTBEAT_MS = 30_000;

@Injectable()
export class NewsService {
  // The hub that fans news changes out to every connected SSE client. Each write
  // method calls `.next(...)`; the @Sse() endpoint subscribes via `stream()`.
  private readonly events$ = new Subject<NewsStreamEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // ---------------------------------------------------------------------------
  // READ (public API + admin display)
  // ---------------------------------------------------------------------------

  /** Published items only, pinned first then newest — the PWA carousel feed. */
  async listPublished(): Promise<NewsDto[]> {
    const rows = await this.prisma.news.findMany({
      where: { isPublished: true },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  /** Everything, including drafts — for the admin list. */
  listAll(): Promise<News[]> {
    return this.prisma.news.findMany({
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  /** The raw row — 404 if it's gone. */
  async getNews(id: string): Promise<News> {
    const row = await this.prisma.news.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('News item not found.');
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // REAL-TIME STREAM (SSE)
  // ---------------------------------------------------------------------------

  /**
   * The Observable the @Sse() endpoint returns. It merges the live change feed
   * with a periodic heartbeat. Each value becomes one `data:` frame on the wire
   * (NestJS JSON-encodes the `data` object); the browser's EventSource handles
   * reconnection automatically.
   */
  stream(): Observable<MessageEvent> {
    const changes$ = this.events$.pipe(map((event) => ({ data: event })));
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({ data: { type: 'ping' satisfies NewsStreamType } })),
    );
    return merge(changes$, heartbeat$);
  }

  // ---------------------------------------------------------------------------
  // WRITE (admin)
  // ---------------------------------------------------------------------------

  async create(input: NewsInput): Promise<News> {
    const row = await this.prisma.news.create({ data: this.toData(input) });
    // A freshly published item is "new" → clients toast it. A draft stays silent.
    if (row.isPublished) {
      this.notifyNew(row);
    }
    return row;
  }

  async update(id: string, input: NewsInput): Promise<News> {
    const existing = await this.getNews(id);
    const row = await this.prisma.news.update({
      where: { id },
      data: this.toData(input),
    });

    // Decide what the change means to the public stream:
    if (!row.isPublished) {
      // It's a draft now — clients should drop it.
      this.events$.next({ type: 'deleted', id: row.id });
    } else if (!existing.isPublished) {
      // It just went from draft → published, so it's newly visible → toast it.
      this.notifyNew(row);
    } else {
      // An already-public item was edited → refresh, but don't toast.
      this.broadcast('updated', row);
    }
    return row;
  }

  async remove(id: string): Promise<void> {
    const row = await this.getNews(id);
    await this.prisma.news.delete({ where: { id } });
    this.events$.next({ type: 'deleted', id: row.id });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /** Push a published item to all SSE clients as the given change type. */
  private broadcast(
    type: Exclude<NewsStreamType, 'deleted' | 'ping'>,
    row: News,
  ) {
    this.events$.next({ type, item: this.toDto(row) });
  }

  /**
   * A newly-published item: announce it on the SSE stream (→ in-app toast) AND
   * fan it out as an OS push notification. The push is fire-and-forget, so a slow
   * or unreachable push service never delays the admin's save.
   */
  private notifyNew(row: News): void {
    const item = this.toDto(row);
    this.events$.next({ type: 'created', item });
    void this.push.sendToAll({
      title: item.title,
      body: item.body,
      url: item.link ?? '/',
      tag: `news-${item.id}`,
    });
  }

  /** Validate + normalise the form input into a Prisma data object. */
  private toData(input: NewsInput) {
    return {
      title: this.requireText(input.title, 'عنوان خبر را وارد کنید.'),
      category: this.validateCategory(input.category),
      body: this.requireText(input.body, 'متن خبر را وارد کنید.'),
      link: this.cleanOptional(input.link),
      pinned: input.pinned ?? false,
      isPublished: input.isPublished ?? true,
    };
  }

  private toDto(row: News): NewsDto {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: newsCategoryLabel(row.category),
      body: row.body,
      link: row.link,
      pinned: row.pinned,
      publishedAt: row.publishedAt.toISOString(),
      dateLabel: this.formatNewsDate(row.publishedAt),
    };
  }

  /** e.g. «شنبه ۱۶ خرداد» — weekday + day + month in the university's timezone. */
  private formatNewsDate(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: CALENDAR_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  private validateCategory(category?: string): string {
    const text = category?.trim();
    if (!text || !isKnownNewsCategory(text)) {
      throw new BadRequestException('دستهٔ انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  private requireText(
    value: string | undefined | null,
    message: string,
  ): string {
    const text = value?.trim();
    if (!text) {
      throw new BadRequestException(message);
    }
    return text;
  }

  private cleanOptional(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
