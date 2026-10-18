import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({
  connectionString: process.env['DATABASE_URL'],
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const seeds = [
    {
      id: 'seed-task-1',
      title: 'Diseñar el layout del dashboard',
      project: 'Chucks Web',
      due: 'Hoy',
      completed: true,
    },
    {
      id: 'seed-task-2',
      title: 'Definir paleta de colores y tipografía',
      project: 'Chucks Web',
      due: 'Mañana',
      completed: false,
    },
  ];

  for (const seed of seeds) {
    const { id, ...data } = seed;
    await prisma.task.upsert({
      where: { id },
      update: {},
      create: { id, ...data },
    });
  }

  console.log(`Seeded ${seeds.length} tasks`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
