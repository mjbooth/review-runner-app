import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import Redis from 'ioredis';

const healthRoutes: FastifyPluginAsync = async function (fastify) {
  // Basic health check
  fastify.get('/', async (request, reply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };

    return reply.send(health);
  });

  // Deep health check with dependencies
  fastify.get('/deep', async (request, reply) => {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'unknown' },
        redis: { status: 'unknown' },
        external: { status: 'unknown' },
      },
    };

    let overallStatus = 'ok';

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.checks.database = { status: 'ok' };
    } catch (error) {
      logger.error('Database health check failed: ' + (error instanceof Error ? error.message : String(error)));
      (checks.checks.database as any) = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      overallStatus = 'error';
    }

    // Check Redis connection
    try {
      const redis = new Redis(process.env.REDIS_URL!);
      await redis.ping();
      await redis.quit();
      checks.checks.redis = { status: 'ok' };
    } catch (error) {
      logger.error('Redis health check failed: ' + (error instanceof Error ? error.message : String(error)));
      (checks.checks.redis as any) = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      overallStatus = 'error';
    }

    // Check external services (basic connectivity test)
    try {
      // This is a lightweight check - just verify we can make requests
      const responses = await Promise.allSettled([
        fetch('https://api.twilio.com', { method: 'HEAD' }).catch(() => ({ ok: false })),
        fetch('https://api.sendgrid.com', { method: 'HEAD' }).catch(() => ({ ok: false })),
      ]);

      const hasFailures = responses.some(
        result => result.status === 'rejected' || !result.value?.ok
      );

      (checks.checks.external as any) = {
        status: hasFailures ? 'warning' : 'ok',
        ...(hasFailures && { message: 'Some external services may be unreachable' }),
      };
    } catch (error) {
      (checks.checks.external as any) = {
        status: 'warning',
        message: 'Could not verify external service connectivity',
      };
    }

    checks.status = overallStatus;

    const statusCode = overallStatus === 'error' ? 503 : 200;
    return reply.code(statusCode).send(checks);
  });
};

export default healthRoutes;
