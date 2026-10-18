import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.task.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    return task;
  }

  create(dto: CreateTaskDto) {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        project: dto.project ?? 'General',
        due: dto.due ?? 'Hoy',
      },
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.findOne(id);
    return this.prisma.task.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.task.delete({ where: { id } });
  }
}
