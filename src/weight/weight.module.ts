import { Module } from '@nestjs/common';
import { WeightController } from './weight.controller.js';
import { WeightService } from './weight.service.js';

@Module({ controllers: [WeightController], providers: [WeightService] })
export class WeightModule {}
