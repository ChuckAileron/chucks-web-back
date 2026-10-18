import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CollectionsModule } from './collections/collections.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [PrismaModule, TasksModule, CollectionsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
