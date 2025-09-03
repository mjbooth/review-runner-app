/**
 * Business Context Middleware for API Routes
 *
 * Automatically sets and manages business context for multi-tenant operations
 * with Row Level Security (RLS) enforcement.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { prisma } from '../../lib/prisma';
import { withBusinessContext, isBusinessContextError } from '../../lib/business-context';
import { logger } from '../../lib/logger';

/**
 * Extended Fastify request with business context
 */
export interface BusinessContextRequest extends FastifyRequest {
  businessId?: string;
  clerkUserId?: string;
}

/**
 * Middleware to set business context for authenticated requests
 *
 * This middleware:
 * 1. Extracts the authenticated user from Clerk JWT
 * 2. Sets the appropriate business context for RLS
 * 3. Adds businessId to the request object for easy access
 * 4. Handles errors and cleanup
 */
export async function businessContextMiddleware(
  request: BusinessContextRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get authentication info from Clerk
    const auth = getAuth(request);

    if (!auth?.userId) {
      // Not authenticated - let auth middleware handle this
      return;
    }

    request.clerkUserId = auth.userId;

    // Set business context using the utility function
    // This will validate the user and set the appropriate business context
    const businessId = await withBusinessContext(prisma, auth.userId, async () => {
      // Get business info for the current user
      const business = await prisma.business.findUnique({
        where: {
          clerkUserId: auth.userId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!business) {
        throw new Error(`No active business found for user ${auth.userId}`);
      }

      return business.id;
    });

    // Add businessId to request for easy access in routes
    request.businessId = businessId;

    logger.debug('Business context set for request', {
      userId: auth.userId,
      businessId,
      method: request.method,
      url: request.url,
    });
  } catch (error) {
    logger.error('Business context middleware error', {
      userId: request.clerkUserId,
      method: request.method,
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
    });

    if (isBusinessContextError(error)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'BUSINESS_ACCESS_DENIED',
          message: 'Access denied: Invalid business context',
          details: error.message,
        },
      });
    }

    // For other errors, return 500
    return reply.status(500).send({
      success: false,
      error: {
        code: 'BUSINESS_CONTEXT_ERROR',
        message: 'Failed to establish business context',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

/**
 * Utility function to execute database operations within business context
 * for API routes
 *
 * @param request - Fastify request with business context
 * @param operation - Database operation to execute
 * @returns Result of the operation
 */
export async function executeInBusinessContext<T>(
  request: BusinessContextRequest,
  operation: () => Promise<T>
): Promise<T> {
  if (!request.clerkUserId) {
    throw new Error('Request not authenticated');
  }

  if (!request.businessId) {
    throw new Error('Business context not established');
  }

  // The business context is already set by the middleware,
  // but we use withBusinessContext for additional safety and logging
  return withBusinessContext(prisma, request.clerkUserId, operation, request.businessId);
}

/**
 * Decorator function to ensure business context for route handlers
 *
 * @param handler - The route handler function
 * @returns Wrapped handler with business context
 */
export function withBusinessContextRoute<T extends BusinessContextRequest>(
  handler: (request: T, reply: FastifyReply) => Promise<void>
) {
  return async (request: T, reply: FastifyReply): Promise<void> => {
    // Business context should already be set by middleware
    if (!request.businessId) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'BUSINESS_CONTEXT_MISSING',
          message: 'Business context not established',
        },
      });
    }

    try {
      await handler(request, reply);
    } catch (error) {
      logger.error('Route handler error with business context', {
        businessId: request.businessId,
        userId: request.clerkUserId,
        method: request.method,
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });

      if (isBusinessContextError(error)) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'BUSINESS_ACCESS_DENIED',
            message: error.message,
          },
        });
      }

      throw error; // Let the error handler middleware handle other errors
    }
  };
}

/**
 * Validation function to ensure business-scoped resources
 *
 * @param request - Request with business context
 * @param resourceBusinessId - The business ID of the resource being accessed
 * @throws Error if business IDs don't match
 */
export function validateBusinessAccess(
  request: BusinessContextRequest,
  resourceBusinessId: string
): void {
  if (!request.businessId) {
    throw new Error('Business context not established');
  }

  if (request.businessId !== resourceBusinessId) {
    throw new Error(`Access denied: Resource belongs to different business`);
  }
}
