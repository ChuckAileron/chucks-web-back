import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CollectionsModule } from './collections/collections.module.js';
import { ImagesModule } from './images/images.module.js';
import { LaunchboxModule } from './launchbox/launchbox.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { WishlistModule } from './wishlist/wishlist.module.js';
import { WikiModule } from './wiki/wiki.module.js';
import { ShoppingModule } from './shopping/shopping.module.js';
import { HijitosModule } from './hijitos/hijitos.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { WeightModule } from './weight/weight.module.js';

@Module({
  imports: [
    PrismaModule,
    TasksModule,
    CollectionsModule,
    WishlistModule,
    WikiModule,
    ShoppingModule,
    HijitosModule,
    AccountsModule,
    CalendarModule,
    WeightModule,
    LaunchboxModule,
    ImagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
