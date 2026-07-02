import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CourseFormDto } from './dto/course-form.dto';
import {
  CourseDto,
  ScheduleSettingsDto,
  WeeklyScheduleDto,
} from './dto/schedule.dto';
import { SettingsFormDto } from './dto/settings-form.dto';
import { ScheduleService } from './schedule.service';

/**
 * The student's personal weekly timetable (برنامه هفتگی). Unlike the calendar/
 * news/documents APIs (public, staff-managed content), EVERY route here is
 * behind the access-token guard — the data belongs to one logged-in student.
 */
@ApiTags('schedule')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or expired access token' })
@UseGuards(JwtAccessGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  @ApiOperation({ summary: "The caller's full weekly schedule + settings" })
  @ApiOkResponse({ type: WeeklyScheduleDto })
  getSchedule(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WeeklyScheduleDto> {
    return this.schedule.getSchedule(user.id);
  }

  @Post('courses')
  @ApiOperation({ summary: 'Add a course with its weekly sessions' })
  @ApiOkResponse({ type: CourseDto })
  createCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CourseFormDto,
  ): Promise<CourseDto> {
    return this.schedule.createCourse(user.id, dto);
  }

  @Patch('courses/:id')
  @ApiOperation({
    summary: 'Update a course (sessions are replaced wholesale)',
  })
  @ApiOkResponse({ type: CourseDto })
  @ApiNotFoundResponse({ description: "Course doesn't exist or isn't yours" })
  updateCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CourseFormDto,
  ): Promise<CourseDto> {
    return this.schedule.updateCourse(user.id, id, dto);
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a course and all its sessions' })
  @ApiNotFoundResponse({ description: "Course doesn't exist or isn't yours" })
  async deleteCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.schedule.deleteCourse(user.id, id);
    return { ok: true };
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Update reminder preferences / declare week parity',
  })
  @ApiOkResponse({ type: ScheduleSettingsDto })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SettingsFormDto,
  ): Promise<ScheduleSettingsDto> {
    return this.schedule.updateSettings(user.id, dto);
  }
}
