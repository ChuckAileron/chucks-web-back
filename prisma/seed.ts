import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { resolveDatabaseConfig, toPoolConfig } from '../src/config/env.js';

const db = resolveDatabaseConfig(process.env);
const adapter = new PrismaPg(new pg.Pool(toPoolConfig(db)), {
  schema: db.schema,
  disposeExternalPool: true,
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

  const games = await prisma.collection.upsert({
    where: { name: 'Videojuegos' },
    update: {},
    create: {
      name: 'Videojuegos',
      description: 'Mi biblioteca personal de juegos.',
      type: 'generic',
      position: 0,
      columns: {
        create: [
          { name: 'plataforma', label: 'Plataforma', type: 'string', required: false, position: 0 },
          { name: 'anio', label: 'Año', type: 'number', required: false, position: 1 },
          { name: 'completado', label: 'Completado', type: 'boolean', required: false, position: 2 },
        ],
      },
    },
  });

  const movies = await prisma.collection.upsert({
    where: { name: 'Películas' },
    update: {},
    create: {
      name: 'Películas',
      description: 'Películas favoritas y por ver.',
      type: 'generic',
      position: 1,
      columns: {
        create: [
          { name: 'estreno', label: 'Estreno', type: 'date', required: false, position: 0 },
          { name: 'direccion', label: 'Dirección', type: 'string', required: false, position: 1 },
        ],
      },
    },
  });

  const gameItems = [
    {
      name: 'Chrono Trigger',
      values: { plataforma: 'SNES', anio: 1995, completado: true },
      tags: ['jrpg', 'clásico'],
    },
    {
      name: 'Hollow Knight',
      values: { plataforma: 'PC', anio: 2017, completado: false },
      tags: ['metroidvania', 'indie'],
    },
    {
      name: 'The Legend of Zelda: Breath of the Wild',
      values: { plataforma: 'Switch', anio: 2017, completado: true },
      tags: ['aventura'],
    },
  ];

  for (const item of gameItems) {
    const exists = await prisma.collectionItem.findFirst({
      where: { collectionId: games.id, name: item.name },
    });
    if (!exists) {
      await prisma.collectionItem.create({
        data: { collectionId: games.id, ...item },
      });
    }
  }

  const movieItems = [
    {
      name: 'Blade Runner 2049',
      values: { estreno: '2017-10-06', direccion: 'Denis Villeneuve' },
      tags: ['ciencia ficción'],
    },
    {
      name: 'Spider-Man: Into the Spider-Verse',
      values: { estreno: '2018-12-14', direccion: 'Bob Persichetti' },
      tags: ['animación', 'superhéroes'],
    },
  ];

  for (const item of movieItems) {
    const exists = await prisma.collectionItem.findFirst({
      where: { collectionId: movies.id, name: item.name },
    });
    if (!exists) {
      await prisma.collectionItem.create({
        data: { collectionId: movies.id, ...item },
      });
    }
  }

  console.log(
    `Seeded collections: ${games.name} (${gameItems.length} items), ${movies.name} (${movieItems.length} items)`,
  );

  const wishlistItems = [
    {
      name: 'Super Metroid',
      manufacturer: 'Nintendo',
      year: 1994,
      prices: [
        { store: 'eBay', url: 'https://www.ebay.com/sch/i.html?_nkw=super+metroid' },
      ],
    },
    {
      name: 'Consola Analogue Pocket',
      manufacturer: 'Analogue',
      year: 2021,
      prices: [
        { store: 'Mercari', url: 'https://www.mercari.com/search/?keyword=analogue+pocket' },
      ],
    },
  ];

  for (const item of wishlistItems) {
    const exists = await prisma.wishlistItem.findFirst({
      where: { name: item.name },
    });
    if (!exists) {
      await prisma.wishlistItem.create({
        data: {
          name: item.name,
          manufacturer: item.manufacturer,
          year: item.year,
          prices: { create: item.prices },
        },
      });
    }
  }

  console.log(`Seeded wishlist: ${wishlistItems.length} items`);
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
