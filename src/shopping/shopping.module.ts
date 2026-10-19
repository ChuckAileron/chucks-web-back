import { Module } from '@nestjs/common';
import { ShoppingController } from './shopping.controller.js';
import { ShoppingService } from './shopping.service.js';
import { BuyeeRendererService } from '../common/buyee-renderer.service.js';

@Module({
  controllers: [ShoppingController],
  providers: [ShoppingService, BuyeeRendererService],
})
export class ShoppingModule {}
