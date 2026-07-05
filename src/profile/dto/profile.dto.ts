import { ApiProperty } from '@nestjs/swagger';

/** The level tier a student has reached from their score. */
export class ProfileLevelDto {
  @ApiProperty({ example: 'active' })
  key!: string;

  @ApiProperty({ example: 'فعال' })
  label!: string;
}

/** Score / completion summary — drives the ring, the point badge and the level. */
export class ProfileCompletionDto {
  @ApiProperty({ example: 65, description: 'Points earned so far.' })
  score!: number;

  @ApiProperty({ example: 115, description: 'Maximum possible points.' })
  maxScore!: number;

  @ApiProperty({ example: 57, description: 'Completion percentage (0-100).' })
  percent!: number;

  @ApiProperty({ example: 9 })
  filledCount!: number;

  @ApiProperty({ example: 16 })
  totalCount!: number;

  @ApiProperty({ type: ProfileLevelDto })
  level!: ProfileLevelDto;

  @ApiProperty({
    description: 'Which scored fields are complete, keyed by field name.',
    example: { name: true, phone: false },
  })
  filled!: Record<string, boolean>;
}

/**
 * GET /profile / PATCH /profile response. Merges the account identity (from the
 * user) with the extended profile fields and the computed completion summary.
 * All profile fields are nullable — the student fills them in over time.
 */
export class ProfileDto {
  // ---- Identity (from the user record) ----
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'student@univers.app' })
  email!: string;

  @ApiProperty({ example: 'علی رضایی', nullable: true })
  name!: string | null;

  @ApiProperty()
  createdAt!: Date;

  // ---- Personal ----
  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  nationalId!: string | null;

  @ApiProperty({ nullable: true })
  birthDate!: string | null;

  @ApiProperty({ nullable: true, enum: ['male', 'female'] })
  gender!: string | null;

  @ApiProperty({ nullable: true })
  province!: string | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  // ---- Academic ----
  @ApiProperty({ nullable: true })
  studentId!: string | null;

  @ApiProperty({ nullable: true })
  major!: string | null;

  @ApiProperty({ nullable: true })
  faculty!: string | null;

  @ApiProperty({ nullable: true })
  degree!: string | null;

  @ApiProperty({ nullable: true })
  entryYear!: number | null;

  @ApiProperty({ nullable: true })
  advisor!: string | null;

  // ---- Bio & emergency ----
  @ApiProperty({ nullable: true })
  bio!: string | null;

  @ApiProperty({ nullable: true })
  emergencyName!: string | null;

  @ApiProperty({ nullable: true })
  emergencyPhone!: string | null;

  @ApiProperty({ nullable: true })
  telegram!: string | null;

  // ---- Avatar ----
  @ApiProperty({
    nullable: true,
    description:
      'Relative URL to stream the avatar (with a cache-busting version), or null.',
    example: '/profile/clx.../avatar?v=1720000000000',
  })
  avatarUrl!: string | null;

  // ---- Completion ----
  @ApiProperty({ type: ProfileCompletionDto })
  completion!: ProfileCompletionDto;
}
