import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';

@Module({ controllers: [CalendarController], providers: [CalendarService, GoogleCalendarService] })
export class CalendarModule {}
