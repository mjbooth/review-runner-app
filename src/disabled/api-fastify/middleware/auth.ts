import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken } from '@clerk/backend';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import type { AuthenticatedUser } from '../../types/auth';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
    businessId?: string;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: any) => Promise<void>;
  }
}

const authMiddleware: FastifyPluginAsync = async function (fastify) {
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: any) {
    try {
      // Skip auth for health checks and public routes
      if (
        request.url.startsWith('/health') ||
        request.url.startsWith('/r/') ||
        request.url.startsWith('/webhooks/')
      ) {
        return;
      }

      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'No authorization token provided' },
        } as any);
      }

      // Verify Clerk JWT token
      let clerkUserId: string;
      try {
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (!secretKey) {
          throw new Error('CLERK_SECRET_KEY not configured');
        }

        const sessionToken = await verifyToken(token, {
          secretKey,
        });
        clerkUserId = sessionToken.sub;
      } catch (verifyError) {
        logger.warn('JWT verification failed: ' + (verifyError instanceof Error ? verifyError.message : String(verifyError)));
        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        } as any);
      }

      if (!clerkUserId) {
        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid token format' },
        } as any);
      }

      // Get business for this user
      const business = await prisma.business.findUnique({
        where: { clerkUserId },
        select: { id: true, isActive: true },
      });

      if (!business) {
        logger.warn('Business not found for user: ' + clerkUserId);
        return reply.code(404).send({
          success: false,
          error: { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' },
        } as any);
      }

      if (!business.isActive) {
        return reply.code(403).send({
          success: false,
          error: { code: 'BUSINESS_INACTIVE', message: 'Business account is inactive' },
        } as any);
      }

      // Attach user info to request
      request.authUser = {
        clerkUserId: clerkUserId,
      };
      request.businessId = business.id;
    } catch (error) {
      logger.error('Auth middleware error: ' + (error instanceof Error ? error.message : String(error)));
      return reply.code(401).send({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
      } as any);
    }
  });
};

export default fp(authMiddleware);
