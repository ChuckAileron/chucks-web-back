import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CollectionsService } from './collections.service.js';
import {
  CreateCollectionDto,
  ImportCollectionDto,
  ReorderCollectionsDto,
  UpdateCollectionDto,
} from './dto/collection.dto.js';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  list() {
    return this.collectionsService.list();
  }

  @Put('reorder')
  reorder(@Body() dto: ReorderCollectionsDto) {
    return this.collectionsService.reorder(dto.ids);
  }

  @Post('import')
  importCollection(@Body() dto: ImportCollectionDto) {
    return this.collectionsService.importCollection(dto.payload);
  }

  @Get(':id/export')
  exportCollection(@Param('id', ParseIntPipe) id: number) {
    return this.collectionsService.exportCollection(id);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.collectionsService.get(id);
  }

  @Post()
  create(@Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collectionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.collectionsService.remove(id);
  }

  @Get(':id/items')
  listItems(
    @Param('id', ParseIntPipe) id: number,
    @Query('q') q?: string,
  ) {
    return this.collectionsService.listItems(id, q);
  }

  @Post(':id/items')
  createItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.collectionsService.createItem(id, body);
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.collectionsService.updateItem(itemId, body);
  }

  @Delete('items/:itemId')
  removeItem(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.collectionsService.removeItem(itemId);
  }
}
