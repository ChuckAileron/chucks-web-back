import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ShoppingModule } from '../shopping/shopping.module.js';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

@Module({
  imports: [PrismaModule, ShoppingModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
