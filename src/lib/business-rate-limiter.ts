/**
 * Business-Scoped Rate Limiting System
 *
 * Advanced rate limiting with business-level controls, progressive penalties,
 * and operation-specific limits to protect against abuse and control costs.
 */

import { type Redis } from 'ioredis';
import { logger } from './logger';
import { prisma } from './prisma';
import type { AuthenticatedRequest } from '../types/auth';

// ==========================================
// RATE LIMITING CONFIGURATION
// ==========================================

/**
 * Rate limiting rules per operation type
 */
export const RATE_LIMIT_RULES = {
  // Data reading operations
  'data.read': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000,
    progressivePenalty: true,
    costMultiplier: 1,
  },

  // SMS operations (cost-sensitive)
  'sms.send': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
    progressivePenalty: true,
    costMultiplier: 5,
    requiresCredits: true,
  },

  // Email operations
  'email.send': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 500,
    progressivePenalty: true,
    costMultiplier: 2,
    requiresCredits: true,
  },

  // Customer import operations
  'customer.import': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    progressivePenalty: true,
    costMultiplier: 10,
  },

  // Bulk operations
  'bulk.create': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    progressivePenalty: true,
    costMultiplier: 5,
  },

  // Admin operations
  'admin.modify': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    progressivePenalty: true,
    costMultiplier: 3,
  },

  // Data write operations
  'data.write': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200,
    progressivePenalty: false,
    costMultiplier: 2,
  },

  // Analytics queries
  'analytics.query': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
    progressivePenalty: false,
    costMultiplier: 1,
  },

  // File upload operations
  'file.upload': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    progressivePenalty: true,
    costMultiplier: 8,
  },
} as const;

export type OperationType = keyof typeof RATE_LIMIT_RULES;

/**
 * Business tier configurations
 */
export const BUSINESS_TIERS = {
  free: {
    multiplier: 1,
    bypassOperations: [],
  },
  starter: {
    multiplier: 2,
    bypassOperations: ['data.read'] as OperationType[],
  },
  professional: {
    multiplier: 5,
    bypassOperations: ['data.read', 'analytics.query'] as OperationType[],
  },
  enterprise: {
    multiplier: 10,
    bypassOperations: ['data.read', 'analytics.query', 'data.write'] as OperationType[],
  },
} as const;

export type BusinessTier = keyof typeof BUSINESS_TIERS;

// ==========================================
// RATE LIMITING ERROR TYPES
// ==========================================

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryAfter: number,
    public readonly details?: {
      limit: number;
      windowMs: number;
      operation: string;
      businessId: string;
      current: number;
    }
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ==========================================
// RATE LIMITING MANAGER
// ==========================================

export class BusinessRateLimiter {
  private redis: Redis;
  private keyPrefix: string = 'rate_limit:business:';
  private penaltyPrefix: string = 'penalty:business:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Check rate limit for a business operation
   */
  async checkRateLimit(
    businessId: string,
    operation: OperationType,
    options: {
      tier?: BusinessTier;
      userId?: string;
      ip?: string;
      quantity?: number;
      bypassCheck?: boolean;
    } = {}
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    windowMs: number;
    retryAfter?: number;
    penaltyMultiplier?: number;
  }> {
    const { tier = 'free', userId, ip, quantity = 1, bypassCheck = false } = options;

    try {
      // Check if operation is bypassed for this tier
      if (BUSINESS_TIERS[tier].bypassOperations.includes(operation)) {
        logger.debug('Rate limit bypassed for business tier', {
          businessId,
          operation,
          tier,
        });

        return {
          allowed: true,
          current: 0,
          limit: Infinity,
          windowMs: 0,
        };
      }

      const rule = RATE_LIMIT_RULES[operation];
      const tierConfig = BUSINESS_TIERS[tier];

      // Calculate effective limit based on tier
      const effectiveLimit = Math.floor(rule.max * tierConfig.multiplier);

      // Get current penalty multiplier
      const penaltyMultiplier = await this.getPenaltyMultiplier(businessId, operation);
      const penaltyAdjustedLimit = Math.max(1, Math.floor(effectiveLimit / penaltyMultiplier));

      // Redis key for this business + operation
      const key = `${this.keyPrefix}${businessId}:${operation}`;
      const window = Math.floor(Date.now() / rule.windowMs);
      const windowKey = `${key}:${window}`;

      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Get current count
      pipeline.get(windowKey);

      // If we're just checking (not incrementing)
      if (bypassCheck) {
        const [currentCount] = (await pipeline.exec()) as [any];
        const current = parseInt(currentCount[1] || '0', 10);

        return {
          allowed: current + quantity <= penaltyAdjustedLimit,
          current,
          limit: penaltyAdjustedLimit,
          windowMs: rule.windowMs,
          penaltyMultiplier: penaltyMultiplier > 1 ? penaltyMultiplier : undefined,
        };
      }

      // Increment counter and set expiry
      pipeline.incrby(windowKey, quantity);
      pipeline.expire(windowKey, Math.ceil(rule.windowMs / 1000));

      const results = await pipeline.exec();
      const newCount = parseInt(results![1]![1] as string, 10);

      const allowed = newCount <= penaltyAdjustedLimit;

      // Log rate limit check
      logger.debug('Rate limit check', {
        businessId,
        operation,
        tier,
        userId,
        ip,
        quantity,
        current: newCount,
        limit: penaltyAdjustedLimit,
        originalLimit: effectiveLimit,
        penaltyMultiplier,
        allowed,
      });

      // If limit exceeded, apply progressive penalty
      if (!allowed && rule.progressivePenalty) {
        await this.applyProgressivePenalty(businessId, operation);
      }

      // Calculate retry after if not allowed
      let retryAfter: number | undefined;
      if (!allowed) {
        const nextWindow = (window + 1) * rule.windowMs;
        retryAfter = Math.ceil((nextWindow - Date.now()) / 1000);
      }

      return {
        allowed,
        current: newCount,
        limit: penaltyAdjustedLimit,
        windowMs: rule.windowMs,
        retryAfter,
        penaltyMultiplier: penaltyMultiplier > 1 ? penaltyMultiplier : undefined,
      };
    } catch (error) {
      logger.error('Rate limit check failed', {
        businessId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        current: 0,
        limit: RATE_LIMIT_RULES[operation].max,
        windowMs: RATE_LIMIT_RULES[operation].windowMs,
      };
    }
  }

  /**
   * Get penalty multiplier for progressive penalties
   */
  private async getPenaltyMultiplier(
    businessId: string,
    operation: OperationType
  ): Promise<number> {
    try {
      const penaltyKey = `${this.penaltyPrefix}${businessId}:${operation}`;
      const penalty = await this.redis.get(penaltyKey);

      if (!penalty) {
        return 1; // No penalty
      }

      const penaltyData = JSON.parse(penalty);
      const now = Date.now();

      // Check if penalty has expired
      if (penaltyData.expiresAt < now) {
        await this.redis.del(penaltyKey);
        return 1;
      }

      // Calculate multiplier based on violation count
      const multiplier = Math.min(10, Math.pow(1.5, penaltyData.violations - 1));

      return multiplier;
    } catch (error) {
      logger.error('Failed to get penalty multiplier', {
        businessId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  }

  /**
   * Apply progressive penalty for repeated violations
   */
  private async applyProgressivePenalty(
    businessId: string,
    operation: OperationType
  ): Promise<void> {
    try {
      const penaltyKey = `${this.penaltyPrefix}${businessId}:${operation}`;
      const existing = await this.redis.get(penaltyKey);

      let violations = 1;
      let firstViolationAt = Date.now();

      if (existing) {
        const penaltyData = JSON.parse(existing);
        violations = penaltyData.violations + 1;
        firstViolationAt = penaltyData.firstViolationAt;
      }

      // Progressive penalty duration (starts at 1 hour, doubles each violation)
      const penaltyDurationMs = Math.min(
        24 * 60 * 60 * 1000, // Max 24 hours
        60 * 60 * 1000 * Math.pow(2, violations - 1) // 1h, 2h, 4h, 8h, etc.
      );

      const penaltyData = {
        violations,
        firstViolationAt,
        lastViolationAt: Date.now(),
        expiresAt: Date.now() + penaltyDurationMs,
      };

      await this.redis.setex(
        penaltyKey,
        Math.ceil(penaltyDurationMs / 1000),
        JSON.stringify(penaltyData)
      );

      logger.warn('Progressive penalty applied', {
        businessId,
        operation,
        violations,
        penaltyDurationMs,
        expiresAt: new Date(penaltyData.expiresAt),
      });

      // Log to audit trail
      await this.logRateLimitViolation(businessId, operation, violations, penaltyDurationMs);
    } catch (error) {
      logger.error('Failed to apply progressive penalty', {
        businessId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if business has sufficient credits for operation
   */
  async checkBusinessCredits(
    businessId: string,
    operation: OperationType,
    quantity: number = 1
  ): Promise<{
    hasCredits: boolean;
    currentCredits: number;
    requiredCredits: number;
    creditType: 'sms' | 'email' | null;
  }> {
    try {
      const rule = RATE_LIMIT_RULES[operation];

      if (!rule.requiresCredits) {
        return {
          hasCredits: true,
          currentCredits: 0,
          requiredCredits: 0,
          creditType: null,
        };
      }

      // Get business credit information
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          smsCreditsUsed: true,
          smsCreditsLimit: true,
          emailCreditsUsed: true,
          emailCreditsLimit: true,
        },
      });

      if (!business) {
        throw new Error(`Business ${businessId} not found`);
      }

      let hasCredits = false;
      let currentCredits = 0;
      let creditType: 'sms' | 'email' | null = null;
      const requiredCredits = quantity * rule.costMultiplier;

      if (operation.startsWith('sms')) {
        creditType = 'sms';
        currentCredits = business.smsCreditsLimit - business.smsCreditsUsed;
        hasCredits = currentCredits >= requiredCredits;
      } else if (operation.startsWith('email')) {
        creditType = 'email';
        currentCredits = business.emailCreditsLimit - business.emailCreditsUsed;
        hasCredits = currentCredits >= requiredCredits;
      }

      logger.debug('Business credits check', {
        businessId,
        operation,
        quantity,
        requiredCredits,
        currentCredits,
        hasCredits,
        creditType,
      });

      return {
        hasCredits,
        currentCredits,
        requiredCredits,
        creditType,
      };
    } catch (error) {
      logger.error('Business credits check failed', {
        businessId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail safe - assume no credits
      return {
        hasCredits: false,
        currentCredits: 0,
        requiredCredits: quantity,
        creditType: operation.startsWith('sms') ? 'sms' : 'email',
      };
    }
  }

  /**
   * Consume credits for an operation
   */
  async consumeCredits(
    businessId: string,
    operation: OperationType,
    quantity: number = 1
  ): Promise<void> {
    const rule = RATE_LIMIT_RULES[operation];

    if (!rule.requiresCredits) {
      return;
    }

    const creditsToConsume = quantity * rule.costMultiplier;

    try {
      if (operation.startsWith('sms')) {
        await prisma.business.update({
          where: { id: businessId },
          data: {
            smsCreditsUsed: {
              increment: creditsToConsume,
            },
          },
        });
      } else if (operation.startsWith('email')) {
        await prisma.business.update({
          where: { id: businessId },
          data: {
            emailCreditsUsed: {
              increment: creditsToConsume,
            },
          },
        });
      }

      logger.debug('Credits consumed', {
        businessId,
        operation,
        quantity,
        creditsConsumed: creditsToConsume,
      });
    } catch (error) {
      logger.error('Failed to consume credits', {
        businessId,
        operation,
        quantity,
        creditsToConsume,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get rate limit status for a business
   */
  async getRateLimitStatus(
    businessId: string,
    tier: BusinessTier = 'free'
  ): Promise<{
    operations: Array<{
      operation: OperationType;
      current: number;
      limit: number;
      windowMs: number;
      penaltyMultiplier?: number;
      resetAt: Date;
    }>;
    credits: {
      sms: { used: number; limit: number; remaining: number };
      email: { used: number; limit: number; remaining: number };
    };
  }> {
    try {
      // Get current usage for all operations
      const operations = await Promise.all(
        Object.keys(RATE_LIMIT_RULES).map(async op => {
          const operation = op as OperationType;
          const status = await this.checkRateLimit(businessId, operation, {
            tier,
            bypassCheck: true,
          });

          const rule = RATE_LIMIT_RULES[operation];
          const window = Math.floor(Date.now() / rule.windowMs);
          const nextWindow = (window + 1) * rule.windowMs;

          return {
            operation,
            current: status.current,
            limit: status.limit,
            windowMs: status.windowMs,
            penaltyMultiplier: status.penaltyMultiplier,
            resetAt: new Date(nextWindow),
          };
        })
      );

      // Get business credits
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          smsCreditsUsed: true,
          smsCreditsLimit: true,
          emailCreditsUsed: true,
          emailCreditsLimit: true,
        },
      });

      const credits = {
        sms: {
          used: business?.smsCreditsUsed || 0,
          limit: business?.smsCreditsLimit || 0,
          remaining: Math.max(
            0,
            (business?.smsCreditsLimit || 0) - (business?.smsCreditsUsed || 0)
          ),
        },
        email: {
          used: business?.emailCreditsUsed || 0,
          limit: business?.emailCreditsLimit || 0,
          remaining: Math.max(
            0,
            (business?.emailCreditsLimit || 0) - (business?.emailCreditsUsed || 0)
          ),
        },
      };

      return { operations, credits };
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Log rate limit violation for audit purposes
   */
  private async logRateLimitViolation(
    businessId: string,
    operation: string,
    violations: number,
    penaltyDurationMs: number
  ): Promise<void> {
    try {
      await prisma.event.create({
        data: {
          businessId,
          type: 'ERROR_OCCURRED', // You might want to add RATE_LIMIT_VIOLATION to your enum
          source: 'system',
          description: `Rate limit violation for ${operation} (${violations} violations)`,
          metadata: {
            operation,
            violations,
            penaltyDurationMs,
            penaltyExpiresAt: new Date(Date.now() + penaltyDurationMs).toISOString(),
          },
        },
      });
    } catch (error) {
      logger.error('Failed to log rate limit violation', {
        businessId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear penalties for a business (admin function)
   */
  async clearPenalties(businessId: string, operation?: OperationType): Promise<void> {
    try {
      const pattern = operation
        ? `${this.penaltyPrefix}${businessId}:${operation}`
        : `${this.penaltyPrefix}${businessId}:*`;

      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);

        logger.info('Penalties cleared', {
          businessId,
          operation,
          keysCleared: keys.length,
        });
      }
    } catch (error) {
      logger.error('Failed to clear penalties', {
        businessId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// ==========================================
// RATE LIMITING MIDDLEWARE
// ==========================================

/**
 * Create rate limiting middleware for specific operations
 */
export function createRateLimitMiddleware(
  operation: OperationType,
  options: {
    quantity?: (request: AuthenticatedRequest) => number;
    skipIf?: (request: AuthenticatedRequest) => boolean;
    onLimit?: (request: AuthenticatedRequest, details: any) => void;
  } = {}
) {
  return async function rateLimitMiddleware(request: AuthenticatedRequest, reply: any) {
    try {
      // Skip rate limiting if condition is met
      if (options.skipIf && options.skipIf(request)) {
        return;
      }

      // Get business context
      const businessId = request.businessId;
      if (!businessId) {
        // If no business context, apply global rate limiting
        // This should not happen with proper auth middleware
        logger.warn('Rate limiting without business context', {
          operation,
          path: request.url,
          ip: request.ip,
        });
        return;
      }

      // Determine quantity
      const quantity = options.quantity ? options.quantity(request) : 1;

      // Get business tier (this should be expanded to actual tier lookup)
      const tier: BusinessTier = 'free'; // TODO: Get from business record

      // Create rate limiter instance (should be singleton)
      const rateLimiter = new BusinessRateLimiter(
        // Redis instance should be injected
        request.server.redis || require('ioredis').createClient(process.env.REDIS_URL)
      );

      // Check credits first if required
      const rule = RATE_LIMIT_RULES[operation];
      if (rule.requiresCredits) {
        const creditCheck = await rateLimiter.checkBusinessCredits(businessId, operation, quantity);

        if (!creditCheck.hasCredits) {
          const error = new RateLimitError(
            `Insufficient ${creditCheck.creditType} credits`,
            'INSUFFICIENT_CREDITS',
            0, // No retry for credit issues
            {
              limit: creditCheck.requiredCredits,
              windowMs: 0,
              operation,
              businessId,
              current: creditCheck.currentCredits,
            }
          );

          logger.warn('Credit limit exceeded', {
            businessId,
            operation,
            required: creditCheck.requiredCredits,
            available: creditCheck.currentCredits,
          });

          if (options.onLimit) {
            options.onLimit(request, error.details);
          }

          return reply.status(402).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_CREDITS',
              message: error.message,
              details: {
                creditType: creditCheck.creditType,
                required: creditCheck.requiredCredits,
                available: creditCheck.currentCredits,
              },
            },
          });
        }
      }

      // Check rate limit
      const limitCheck = await rateLimiter.checkRateLimit(businessId, operation, {
        tier,
        userId: request.clerkUserId,
        ip: request.ip,
        quantity,
      });

      if (!limitCheck.allowed) {
        const error = new RateLimitError(
          `Rate limit exceeded for ${operation}`,
          'RATE_LIMIT_EXCEEDED',
          limitCheck.retryAfter || 0,
          {
            limit: limitCheck.limit,
            windowMs: limitCheck.windowMs,
            operation,
            businessId,
            current: limitCheck.current,
          }
        );

        logger.warn('Rate limit exceeded', {
          businessId,
          operation,
          current: limitCheck.current,
          limit: limitCheck.limit,
          penaltyMultiplier: limitCheck.penaltyMultiplier,
          retryAfter: limitCheck.retryAfter,
        });

        if (options.onLimit) {
          options.onLimit(request, error.details);
        }

        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: error.message,
            retryAfter: limitCheck.retryAfter,
            details: {
              current: limitCheck.current,
              limit: limitCheck.limit,
              windowMs: limitCheck.windowMs,
              penaltyMultiplier: limitCheck.penaltyMultiplier,
            },
          },
        });
      }

      // Store rate limiter in request for potential credit consumption
      (request as any).rateLimiter = rateLimiter;
      (request as any).rateLimitOperation = operation;
      (request as any).rateLimitQuantity = quantity;
    } catch (error) {
      logger.error('Rate limiting middleware error', {
        operation,
        businessId: request.businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail open - allow the request
    }
  };
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalRateLimiter: BusinessRateLimiter | null = null;

/**
 * Get or create global rate limiter instance
 */
export function getRateLimiter(): BusinessRateLimiter {
  if (!globalRateLimiter) {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    globalRateLimiter = new BusinessRateLimiter(redis);
  }
  return globalRateLimiter;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Rate limit decorator for route handlers
 */
export function rateLimit(
  operation: OperationType,
  options?: Parameters<typeof createRateLimitMiddleware>[1]
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const middleware = createRateLimitMiddleware(operation, options);

    descriptor.value = async function (request: AuthenticatedRequest, reply: any) {
      await middleware.call(this, request, reply);
      if (!reply.sent) {
        return originalMethod.call(this, request, reply);
      }
    };

    return descriptor;
  };
}
