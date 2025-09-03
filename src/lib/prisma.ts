import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            {
              emit: 'event',
              level: 'error',
            },
            {
              emit: 'event',
              level: 'warn',
            },
          ]
        : ['error', 'warn'], // Simpler logging in production
  });

// Temporarily disabled event listeners to prevent worker thread crashes
// TODO: Re-enable once logger worker thread issues are resolved
// try {
//   prisma.$on('error', (e) => {
//     console.error('Prisma Error:', e.message);
//   });
//   prisma.$on('warn', (e) => {
//     console.warn('Prisma Warning:', e.message);
//   });
// } catch (err) {
//   console.warn('Prisma event listeners setup failed, continuing without detailed logging');
// }

// Cache the client in development to avoid creating multiple instances
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;
