import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CollectionsModule } from './collections/collections.module.js';
import { ImagesModule } from './images/images.module.js';
import { LaunchboxModule } from './launchbox/launchbox.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { WishlistModule } from './wishlist/wishlist.module.js';

@Module({
  imports: [
    PrismaModule,
    TasksModule,
    CollectionsModule,
    WishlistModule,
    LaunchboxModule,
    ImagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
