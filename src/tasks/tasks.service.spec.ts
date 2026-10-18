import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from './tasks.service.js';
import type { Task } from '../generated/prisma/client.js';

const sampleTask: Task = {
  id: 'task-1',
  title: 'Test task',
  project: 'General',
  due: 'Hoy',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TasksService', () => {
  let service: TasksService;
  const prismaMock = {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(TasksService);
    vi.clearAllMocks();
  });

  it('findAll returns tasks ordered by createdAt', async () => {
    prismaMock.task.findMany.mockResolvedValue([sampleTask]);

    const result = await service.findAll();

    expect(result).toEqual([sampleTask]);
    expect(prismaMock.task.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
    });
  });

  it('create uses General/Hoy defaults', async () => {
    prismaMock.task.create.mockResolvedValue(sampleTask);

    await service.create({ title: 'Test task' });

    expect(prismaMock.task.create).toHaveBeenCalledWith({
      data: { title: 'Test task', project: 'General', due: 'Hoy' },
    });
  });

  it('update throws NotFoundException for missing task', async () => {
    prismaMock.task.findUnique.mockResolvedValue(null);

    await expect(service.update('nope', { completed: true })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update patches an existing task', async () => {
    prismaMock.task.findUnique.mockResolvedValue(sampleTask);
    prismaMock.task.update.mockResolvedValue({
      ...sampleTask,
      completed: true,
    });

    const result = await service.update('task-1', { completed: true });

    expect(result.completed).toBe(true);
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { completed: true },
    });
  });
});
