import { ApiProperty } from '@nestjs/swagger';
import { CONTACT_GROUP_ICONS } from './contact-icons';

/**
 * One phone number in the directory. The PWA formats `phone` for display and uses
 * it verbatim in a `tel:` link, so it ships exactly as staff typed it.
 */
export class PublicContactDto {
  @ApiProperty({ example: 'clx0contact12' })
  id!: string;

  @ApiProperty({ example: 'اداره ثبت‌نام و امتحانات' })
  name!: string;

  @ApiProperty({ example: '02133334456' })
  phone!: string;

  @ApiProperty({
    example: '۲۱۵',
    nullable: true,
    description: 'Optional internal extension shown as «داخلی ۲۱۵».',
  })
  ext!: string | null;

  @ApiProperty({
    example: 'شنبه تا چهارشنبه ۸ تا ۱۴',
    nullable: true,
    description: 'Optional one-line note shown under the name.',
  })
  note!: string | null;

  @ApiProperty({
    example: 'edu@example.ac.ir',
    nullable: true,
    description: 'Optional email, rendered as a mailto link.',
  })
  email!: string | null;
}

/**
 * One group (e.g. «معاونت آموزشی») with its numbers — the shape the PWA renders as
 * a titled card. The whole directory ships in a single GET /phone-book call because
 * the data is small and changes rarely.
 */
export class PhoneBookGroupDto {
  @ApiProperty({ example: 'clx0group1234' })
  id!: string;

  @ApiProperty({ example: 'معاونت آموزشی' })
  title!: string;

  @ApiProperty({
    example: 'education',
    enum: CONTACT_GROUP_ICONS,
    description: 'Icon key the PWA maps to a HugeIcons line icon.',
  })
  icon!: string;

  @ApiProperty({ type: [PublicContactDto] })
  contacts!: PublicContactDto[];
}
