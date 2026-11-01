import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CreateSiteContextDto, CreateSitePageDto } from './sites.dto.js';
import { SitesService } from './sites.service.js';

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get('contexts')
  listContexts() { return this.sites.listContexts(); }

  @Post('contexts')
  createContext(@Body() body: CreateSiteContextDto) { return this.sites.createContext(body.name); }

  @Delete('contexts/:id')
  deleteContext(@Param('id', ParseIntPipe) id: number) { return this.sites.deleteContext(id); }

  @Get('contexts/:id/pages')
  listPages(@Param('id', ParseIntPipe) id: number) { return this.sites.listPages(id); }

  @Post('contexts/:id/pages')
  addPage(@Param('id', ParseIntPipe) id: number, @Body() body: CreateSitePageDto) {
    return this.sites.addPage(id, body.url);
  }

  @Post('pages/:id/capture')
  recapturePage(@Param('id', ParseIntPipe) id: number) { return this.sites.recapturePage(id); }

  @Delete('pages/:id')
  deletePage(@Param('id', ParseIntPipe) id: number) { return this.sites.deletePage(id); }
}
