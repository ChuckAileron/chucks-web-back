import { Body, Controller, Post } from '@nestjs/common';
import { ImagesService } from './images.service.js';
import { ImageSearchDto } from './dto/image-search.dto.js';

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('search')
  search(@Body() dto: ImageSearchDto) {
    return this.imagesService.search(dto);
  }
}
