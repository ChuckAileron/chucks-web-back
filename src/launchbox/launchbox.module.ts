import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module.js';
import { LaunchboxController } from './launchbox.controller.js';
import { LaunchboxService } from './launchbox.service.js';

@Module({
  imports: [CollectionsModule],
  controllers: [LaunchboxController],
  providers: [LaunchboxService],
})
export class LaunchboxModule {}
