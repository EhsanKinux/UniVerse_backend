import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

/**
 * The logged-in student's extended profile. Read/write routes are behind the
 * access-token guard (the data belongs to one user). The avatar-streaming route
 * is deliberately PUBLIC — avatars are low-sensitivity and need to load from an
 * <img> in both the PWA and the server-rendered admin panel.
 */
@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "The caller's profile + completion summary" })
  @ApiOkResponse({ type: ProfileDto })
  @ApiUnauthorizedResponse({ description: 'Missing or expired access token' })
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileDto> {
    return this.profile.getProfile(user.id);
  }

  @Patch()
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update profile fields (omit = keep, "" = clear, value = set)',
  })
  @ApiOkResponse({ type: ProfileDto })
  @ApiConflictResponse({
    description: 'National id / student id already in use',
  })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.profile.updateProfile(user.id, dto);
  }

  @Post('avatar')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload/replace the profile picture (PNG/JPEG/WebP)',
  })
  @ApiOkResponse({ type: ProfileDto })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProfileDto> {
    if (!file) {
      throw new BadRequestException('تصویری انتخاب نشده است.');
    }
    return this.profile.setAvatar(user.id, file);
  }

  @Delete('avatar')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove the profile picture' })
  @ApiOkResponse({ type: ProfileDto })
  removeAvatar(@CurrentUser() user: AuthenticatedUser): Promise<ProfileDto> {
    return this.profile.removeAvatar(user.id);
  }

  // PUBLIC — streams a user's avatar image for <img src>. Two path segments, so
  // it never collides with the account routes above.
  @Get(':userId/avatar')
  @ApiOperation({ summary: "Stream a user's avatar image (public)" })
  @ApiParam({ name: 'userId', description: 'The owner user id' })
  async streamAvatar(
    @Param('userId') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const avatar = await this.profile.openAvatar(userId);
    res.set({
      'Content-Type': avatar.mimeType,
      // Safe to cache hard: the URL carries a ?v= that changes on every upload.
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return new StreamableFile(avatar.stream);
  }
}
