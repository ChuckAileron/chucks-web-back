import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { HijitosService } from './hijitos.service.js';

@Controller('hijitos')
export class HijitosController {
  constructor(private readonly hijitos: HijitosService) {}
  @Get() list() { return this.hijitos.listTracks(); }
  @Get('banner') async getBanner() { return { banner: await this.hijitos.getBanner() }; }
  @Put('banner') async setBanner(@Body() body: { banner: string }) { return { banner: await this.hijitos.setBanner(body.banner) }; }
  @Patch('tracks/:slug') updateTrack(@Param('slug') slug: string, @Body() body: Record<string, unknown>) { return this.hijitos.updateTrack(slug, body); }
  @Post('tasks') createTask(@Body() body: Record<string, unknown>) { return this.hijitos.createTask(body); }
  @Patch('tasks/:id') updateTask(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.hijitos.updateTask(id, body); }
  @Delete('tasks/:id') deleteTask(@Param('id', ParseIntPipe) id: number) { return this.hijitos.deleteTask(id); }
  @Post('tasks/:id/subtasks') createSubtask(@Param('id', ParseIntPipe) id: number, @Body() body: { description: string }) { return this.hijitos.createSubtask(id, body.description); }
  @Patch('subtasks/:id') updateSubtask(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.hijitos.updateSubtask(id, body); }
  @Delete('subtasks/:id') deleteSubtask(@Param('id', ParseIntPipe) id: number) { return this.hijitos.deleteSubtask(id); }
}
