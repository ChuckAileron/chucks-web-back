import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service.js';
import {
  CreateWishlistItemDto,
  CreateWishlistPriceDto,
  UpdateWishlistItemDto,
} from './dto/wishlist.dto.js';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.wishlistService.list(q);
  }

  @Post()
  create(@Body() dto: CreateWishlistItemDto) {
    return this.wishlistService.create(dto);
  }

  @Post('refresh')
  refreshAll() {
    return this.wishlistService.refreshAll();
  }

  // Las rutas de precios se declaran antes que ":id" para que "prices" o
  // "refresh" no se interpreten como identificadores numéricos.
  @Post('prices/:priceId/refresh')
  refreshPrice(@Param('priceId', ParseIntPipe) priceId: number) {
    return this.wishlistService.refreshPrice(priceId);
  }

  @Delete('prices/:priceId')
  removePrice(@Param('priceId', ParseIntPipe) priceId: number) {
    return this.wishlistService.removePrice(priceId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWishlistItemDto,
  ) {
    return this.wishlistService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.wishlistService.remove(id);
  }

  @Post(':id/prices')
  addPrice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateWishlistPriceDto,
  ) {
    return this.wishlistService.addPrice(id, dto);
  }
}
