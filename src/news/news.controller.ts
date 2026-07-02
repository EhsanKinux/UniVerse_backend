import { Controller, Get, type MessageEvent, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { NewsDto } from './dto/news.dto';
import { NewsService } from './news.service';

/**
 * Public, read-only news API consumed by the PWA. The write side (create / edit /
 * delete) lives in the staff-only admin panel. Two endpoints:
 *   • GET /news         — the current published list (React Query reads this).
 *   • GET /news/stream  — a Server-Sent Events feed of changes, so open clients
 *                         update + notify in real time without polling.
 */
@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  @ApiOperation({
    summary: 'Published news/announcements (pinned first, then newest)',
  })
  @ApiOkResponse({ type: [NewsDto] })
  list(): Promise<NewsDto[]> {
    return this.news.listPublished();
  }

  // @Sse marks this as a Server-Sent Events endpoint: NestJS keeps the HTTP
  // response open and streams every value the Observable emits as a `data:`
  // frame. The browser connects with `new EventSource('/news/stream')`.
  @Sse('stream')
  @ApiOperation({
    summary:
      'Real-time stream (SSE) of news changes: created / updated / deleted',
  })
  stream(): Observable<MessageEvent> {
    return this.news.stream();
  }
}
