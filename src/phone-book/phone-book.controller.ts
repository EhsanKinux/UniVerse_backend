import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PhoneBookService } from './phone-book.service';
import { PhoneBookGroupDto } from './dto/phone-book.dto';

/**
 * Public, read-only university phone directory (شماره‌های دانشگاه) consumed by the
 * PWA. The matching write side (groups + numbers) lives in the staff-only admin
 * panel, not here.
 *   • GET /phone-book — every published group with its numbers, in one call.
 */
@ApiTags('phone-book')
@Controller('phone-book')
export class PhoneBookController {
  constructor(private readonly phoneBook: PhoneBookService) {}

  @Get()
  @ApiOperation({
    summary: 'Published contact groups (واحدها) with their phone numbers',
  })
  @ApiOkResponse({ type: [PhoneBookGroupDto] })
  list(): Promise<PhoneBookGroupDto[]> {
    return this.phoneBook.getPublishedTree();
  }
}
