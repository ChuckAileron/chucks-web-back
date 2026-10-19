import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get('colors') colors() { return this.calendar.colors(); }
  @Get('events') list(@Query('start') start?: string, @Query('end') end?: string) { return this.calendar.list(start ?? '', end ?? ''); }
  @Post('events') create(@Body() body: Record<string, unknown>) { return this.calendar.create(body); }
  @Patch('events/:id') update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.calendar.update(id, body); }
  @Delete('events/:id') remove(@Param('id', ParseIntPipe) id: number) { return this.calendar.remove(id); }
  @Post('holidays/:year/refresh') holidays(@Param('year') year: string) { return this.calendar.updateHolidays(Number(year)); }
}
