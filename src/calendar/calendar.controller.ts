import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CalendarService } from './calendar.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { Public } from '../auth/public.decorator.js';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}
  @Get('colors') colors() { return this.calendar.colors(); }
  @Get('google/status') googleStatus() { return this.googleCalendar.status(); }
  @Get('google/connect') googleConnect() { return this.googleCalendar.connect(); }
  @Public()
  @Get('google/callback') async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    const result = await this.googleCalendar.callback(code ?? '', state ?? '', error ?? '');
    response.redirect(result.redirectUrl);
  }
  @Public()
  @Post('google/callback') googleCallbackPost(@Body() body: Record<string, unknown>) {
    return this.googleCalendar.callback(
      typeof body['code'] === 'string' ? body['code'] : '',
      typeof body['state'] === 'string' ? body['state'] : '',
      typeof body['error'] === 'string' ? body['error'] : '',
    );
  }
  @Post('google/sync') googleSync(@Body() body: Record<string, unknown>) { return this.googleCalendar.sync(body['start'], body['end']); }
  @Delete('google') googleDisconnect() { return this.googleCalendar.disconnect(); }
  @Get('events') list(@Query('start') start?: string, @Query('end') end?: string) { return this.calendar.list(start ?? '', end ?? ''); }
  @Post('events') create(@Body() body: Record<string, unknown>) { return this.calendar.create(body); }
  @Patch('events/:id') update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.calendar.update(id, body); }
  @Delete('events/:id') remove(@Param('id', ParseIntPipe) id: number) { return this.calendar.remove(id); }
  @Post('holidays/:year/refresh') holidays(@Param('year') year: string) { return this.calendar.updateHolidays(Number(year)); }
}
