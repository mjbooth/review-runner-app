import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import authMiddleware from './middleware/auth';
import { errorHandler } from './middleware/error-handler';

// Route imports
import businessRoutes from './routes/businesses';
import customerRoutes from './routes/customers';
import reviewRequestRoutes from './routes/review-requests';
import analyticsRoutes from './routes/analytics';
import suppressionRoutes from './routes/suppressions';
import webhookRoutes from './routes/webhooks';
import healthRoutes from './routes/health';
import redirectRoutes from './routes/redirects';
import testRoutes from './routes/test';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }),
  },
  trustProxy: true,
});

async function buildApp() {
  // Register plugins
  await fastify.register(cors, {
    origin: [
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'http://localhost:3000',
      /\.vercel\.app$/,
    ],
    credentials: true,
  });

  // Skip JWT registration for now - will handle auth in middleware
  // await fastify.register(jwt, {
  //   secret: process.env.CLERK_SECRET_KEY!,
  // });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: request => {
      const businessId = (request as any).businessId;
      return businessId || request.ip;
    },
  });

  await fastify.register(multipart);

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  // Skip auth middleware for now
  // fastify.register(authMiddleware);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(redirectRoutes, { prefix: '/r' });
  await fastify.register(webhookRoutes, { prefix: '/webhooks' });

  // Test routes (development only)
  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(testRoutes, { prefix: '/api/test' });
  }

  // Temporarily unprotected API routes for testing
  await fastify.register(
    async function (fastify) {
      // Add temporary middleware to set businessId for testing
      fastify.addHook('preHandler', async (request, reply) => {
        // Get or create a default business for testing
        const business =
          (await prisma.business.findFirst()) ||
          (await prisma.business.create({
            data: {
              name: 'Test Business',
              email: 'test@example.com',
              clerkUserId: 'temp_user_id',
              isActive: true,
            },
          }));

        request.businessId = business.id;
        request.user = {
          id: 'temp_user_id',
          businessId: business.id,
        };
      });

      await fastify.register(businessRoutes, { prefix: '/businesses' });
      await fastify.register(customerRoutes, { prefix: '/customers' });
      await fastify.register(reviewRequestRoutes, { prefix: '/review-requests' });
      await fastify.register(analyticsRoutes, { prefix: '/analytics' });
      await fastify.register(suppressionRoutes, { prefix: '/suppressions' });
    },
    { prefix: '/api' }
  );

  // TODO: Re-enable authentication
  // Protected API routes
  // await fastify.register(async function (fastify) {
  //   await fastify.register(businessRoutes, { prefix: '/api/businesses' });
  //   await fastify.register(customerRoutes, { prefix: '/api/customers' });
  //   await fastify.register(reviewRequestRoutes, { prefix: '/api/review-requests' });
  //   await fastify.register(analyticsRoutes, { prefix: '/api/analytics' });
  //   await fastify.register(suppressionRoutes, { prefix: '/api/suppressions' });
  // }, {
  //   preHandler: fastify.authenticate,
  // });

  return fastify;
}

async function start() {
  try {
    const app = await buildApp();

    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    logger.info(`🚀 API server running on http://${host}:${port}`);
  } catch (error) {
    console.error('Failed to start server - Full Error:', error);
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  try {
    await fastify.close();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
});

if (require.main === module) {
  start();
}

export { buildApp, start };
