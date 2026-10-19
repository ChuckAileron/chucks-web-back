import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AddShopLinksDto, CreateShopContextDto, SHOP_SORTS } from './dto/shopping.dto.js';
import { ShoppingService } from './shopping.service.js';

@Controller('shopping')
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  @Get('contexts')
  listContexts() { return this.shopping.listContexts(); }

  @Post('contexts')
  createContext(@Body() body: CreateShopContextDto) { return this.shopping.createContext(body.name); }

  @Delete('contexts/:id')
  deleteContext(@Param('id', ParseIntPipe) id: number) { return this.shopping.deleteContext(id); }

  @Get('contexts/:id/items')
  listItems(@Param('id', ParseIntPipe) id: number, @Query('sort') sort?: string) {
    const validSort = SHOP_SORTS.find((option) => option === sort) ?? 'date-desc';
    return this.shopping.listItems(id, validSort);
  }

  @Post('contexts/:id/links')
  addLinks(@Param('id', ParseIntPipe) id: number, @Body() body: AddShopLinksDto) {
    return this.shopping.addLinks(id, body.text);
  }

  @Post('contexts/:id/refresh')
  refreshItems(@Param('id', ParseIntPipe) id: number) { return this.shopping.refreshItems(id); }

  @Delete('contexts/:id/inactive')
  clearInactiveItems(@Param('id', ParseIntPipe) id: number) { return this.shopping.clearInactiveItems(id); }
}
