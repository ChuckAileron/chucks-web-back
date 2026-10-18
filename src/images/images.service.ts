import { Injectable } from '@nestjs/common';
import { searchImages } from '../common/image-search.js';
import { ImageSearchDto } from './dto/image-search.dto.js';

@Injectable()
export class ImagesService {
  search(dto: ImageSearchDto) {
    return searchImages(dto);
  }
}
