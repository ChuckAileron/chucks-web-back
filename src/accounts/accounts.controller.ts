import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}
  @Get() list() { return this.accounts.list(); }
  @Post() create(@Body() body: Record<string, unknown>) { return this.accounts.create(body); }
  @Put('reorder') reorder(@Body() body: { ids: number[] }) { return this.accounts.reorder(body.ids); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.accounts.get(id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.accounts.update(id, body); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.accounts.remove(id); }
  @Get(':id/registers') registers(@Param('id', ParseIntPipe) id: number, @Query('q') query?: string) { return this.accounts.listRegisters(id, query); }
  @Get(':id/years') years(@Param('id', ParseIntPipe) id: number) { return this.accounts.registeredYears(id); }
  @Get(':id/monthly') monthly(@Param('id', ParseIntPipe) id: number, @Query('year') year?: string) { return this.accounts.monthlyTotals(id, Number(year)); }
  @Post('registers') createRegister(@Body() body: Record<string, unknown>) { return this.accounts.createRegister(body); }
  @Patch('registers/:id') updateRegister(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.accounts.updateRegister(id, body); }
  @Delete('registers/:id') deleteRegister(@Param('id', ParseIntPipe) id: number) { return this.accounts.removeRegister(id); }
}
