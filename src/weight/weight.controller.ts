import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { WeightService } from './weight.service.js';

@Controller('weight')
export class WeightController {
  constructor(private readonly weight: WeightService) {}
  @Get() state() { return this.weight.state(); }
  @Put('target') setTarget(@Body() body: { target: unknown }) { return this.weight.setTarget(body.target); }
  @Post('entries') addEntry(@Body() body: { date: string; weight: unknown }) { return this.weight.addEntry(body); }
  @Delete('entries/:date') deleteEntry(@Param('date') date: string) { return this.weight.deleteEntry(date); }
}
