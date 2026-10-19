import { Module } from '@nestjs/common';
import { HijitosController } from './hijitos.controller.js';
import { HijitosService } from './hijitos.service.js';

@Module({ controllers: [HijitosController], providers: [HijitosService] })
export class HijitosModule {}
