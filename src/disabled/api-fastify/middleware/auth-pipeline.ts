/**
 * Complete Authentication Pipeline Middleware
 *
 * Integrates Clerk JWT validation, business context setting, and Row Level Security
 * into a comprehensive authentication system for Fastify routes.
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ClerkJWTValidator, ClerkJWTError, getClerkJWTValidator } from '../../lib/clerk-jwt';
import {
  getAuthBusinessContextManager,
  AuthBusinessContextError,
} from '../../lib/auth-business-context';
import type {
  AuthenticatedRequest,
  AuthContext,
  AuthLevel,
  AuthError,
  AuthEvent,
  AuthMiddlewareOptions,
  RouteProtectionConfig,
} from '../../types/auth';

/**
 * Authentication statistics for monitoring
 */
interface AuthStats {
  totalRequests: number;
  successfulAuth: number;
  failedAuth: number;
  rateLimited: number;
  businessContextErrors: number;
  lastReset: Date;
}

/**
 * Authentication pipeline class
 */
export class AuthPipeline {
  private jwtValidator: ClerkJWTValidator;
  private businessContextManager: ReturnType<typeof getAuthBusinessContextManager>;
  private authStats: AuthStats;
  private suspiciousIPs = new Map<string, { attempts: number; lastAttempt: Date }>();
  private options: Required<AuthMiddlewareOptions>;

  constructor(options: AuthMiddlewareOptions) {
    this.options = {
      skipPaths: ['/health', '/r/', '/webhooks/'],
      enableRateLimit: true,
      rateLimit: {
        max: 100,
        windowMs: 15 * 60 * 1000, // 15 minutes
        skipSuccessfulRequests: true,
      },
      jwtOptions: {
        algorithms: ['RS256'],
      },
      businessContext: {
        allowNoBusiness: false,
        cacheDuration: 5 * 60 * 1000, // 5 minutes
      },
      security: {
        enableLogging: true,
        blockSuspicious: true,
        maxFailedAttempts: 10,
      },
      ...options,
    };

    // Initialize JWT validator
    this.jwtValidator = getClerkJWTValidator({
      secretKey: process.env.CLERK_SECRET_KEY!,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
    });

    // Initialize business context manager
    this.businessContextManager = getAuthBusinessContextManager(
      prisma,
      this.options.businessContext
    );

    // Initialize stats
    this.authStats = {
      totalRequests: 0,
      successfulAuth: 0,
      failedAuth: 0,
      rateLimited: 0,
      businessContextErrors: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Main authentication middleware
   */
  async authenticate(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const startTime = Date.now();
    this.authStats.totalRequests++;

    try {
      // Skip authentication for certain paths
      if (this.shouldSkipAuth(request)) {
        return;
      }

      // Check for suspicious activity
      if (this.options.security.blockSuspicious && this.isSuspiciousRequest(request)) {
        await this.logAuthEvent({
          type: 'suspicious_activity',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string,
          path: request.url,
          method: request.method,
          timestamp: new Date(),
        });

        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many failed authentication attempts',
          },
        });
      }

      // Extract and validate JWT token
      const token = ClerkJWTValidator.extractTokenFromHeaders(request.headers);

      if (!token) {
        await this.handleAuthFailure(request, 'NO_TOKEN', 'No authorization token provided');
        return reply
          .status(401)
          .send(
            ClerkJWTError.createErrorResponse(
              new ClerkJWTError('NO_TOKEN', 'No authorization token provided')
            )
          );
      }

      // Validate JWT token
      let payload, user;
      try {
        const result = await this.jwtValidator.validateToken(token, {
          audience: this.options.jwtOptions?.audience,
          authorizedParties: this.options.jwtOptions?.authorizedParties,
        });
        payload = result;
        user = this.jwtValidator.extractUserInfo(payload);
      } catch (error) {
        if (error instanceof ClerkJWTError) {
          await this.handleAuthFailure(request, error.code, error.message, error.details);
          return reply.status(401).send(ClerkJWTError.createErrorResponse(error));
        }
        throw error;
      }

      // Get business context
      let businessContext;
      try {
        businessContext = await this.businessContextManager.getBusinessContext(user);
      } catch (error) {
        if (error instanceof AuthBusinessContextError) {
          this.authStats.businessContextErrors++;
          await this.handleAuthFailure(request, error.code, error.message, error.details);

          // Different status codes based on error type
          const statusCode = error.code === 'BUSINESS_NOT_FOUND' ? 404 : 403;
          return reply.status(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          });
        }
        throw error;
      }

      // Create complete authentication context
      const authContext: AuthContext = {
        user,
        business: businessContext,
        authenticatedAt: new Date(),
        expiresAt: new Date(payload.exp * 1000),
      };

      // Attach auth context to request
      request.auth = authContext;
      request.user = user;
      request.business = businessContext;
      request.businessId = businessContext.businessId;
      request.clerkUserId = user.clerkUserId;

      // Log successful authentication
      if (this.options.security.enableLogging) {
        await this.logAuthEvent({
          type: 'login',
          userId: user.clerkUserId,
          businessId: businessContext.businessId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string,
          path: request.url,
          method: request.method,
          timestamp: new Date(),
        });
      }

      this.authStats.successfulAuth++;

      logger.debug('Authentication successful', {
        clerkUserId: user.clerkUserId,
        businessId: businessContext.businessId,
        sessionId: user.sessionId,
        duration: Date.now() - startTime,
        path: request.url,
      });
    } catch (error) {
      logger.error('Authentication pipeline error', {
        path: request.url,
        method: request.method,
        ip: request.ip,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication system error',
        },
      });
    }
  }

  /**
   * Route protection based on auth level
   */
  async protectRoute(
    config: RouteProtectionConfig,
    request: AuthenticatedRequest,
    reply: FastifyReply
  ): Promise<boolean> {
    try {
      switch (config.level) {
        case 'none':
          return true;

        case 'optional':
          // Auth is optional, but if present, it should be valid
          // authenticate() will have already set auth context if token was provided
          return true;

        case 'required':
          if (!request.auth) {
            return reply.status(401).send({
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
            });
          }
          break;

        case 'admin':
          if (!request.auth) {
            return reply.status(401).send({
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
            });
          }

          if (!['owner', 'admin'].includes(request.auth.business.role || '')) {
            return reply.status(403).send({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: 'Admin privileges required',
              },
            });
          }
          break;

        case 'system':
          // System routes should not be accessible via regular auth
          return reply.status(403).send({
            success: false,
            error: {
              code: 'ACCESS_DENIED',
              message: 'System route access denied',
            },
          });
      }

      // Check specific permissions
      if (config.permissions && config.permissions.length > 0) {
        if (!request.auth) {
          return reply.status(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required for permission check',
            },
          });
        }

        const userPermissions = request.auth.business.permissions || [];
        const hasPermission = config.permissions.some(permission =>
          userPermissions.includes(permission)
        );

        if (!hasPermission) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: 'Insufficient permissions for this operation',
              details: `Required: ${config.permissions.join(', ')}`,
            },
          });
        }
      }

      // Custom validation
      if (config.validator) {
        if (!request.auth) {
          return reply.status(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required for custom validation',
            },
          });
        }

        const isValid = await config.validator(request.auth);
        if (!isValid) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'ACCESS_DENIED',
              message: 'Custom validation failed',
            },
          });
        }
      }

      return true;
    } catch (error) {
      logger.error('Route protection error', {
        path: request.url,
        level: config.level,
        permissions: config.permissions,
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'PROTECTION_ERROR',
          message: 'Route protection system error',
        },
      });
    }
  }

  /**
   * Check if authentication should be skipped for this request
   */
  private shouldSkipAuth(request: FastifyRequest): boolean {
    const path = request.url;
    return this.options.skipPaths.some(skipPath => path.startsWith(skipPath));
  }

  /**
   * Check if request appears suspicious
   */
  private isSuspiciousRequest(request: FastifyRequest): boolean {
    if (!this.options.security.blockSuspicious) {
      return false;
    }

    const ip = request.ip;
    const now = new Date();
    const suspicious = this.suspiciousIPs.get(ip);

    if (!suspicious) {
      return false;
    }

    // Reset if last attempt was more than an hour ago
    if (now.getTime() - suspicious.lastAttempt.getTime() > 60 * 60 * 1000) {
      this.suspiciousIPs.delete(ip);
      return false;
    }

    return suspicious.attempts >= this.options.security.maxFailedAttempts;
  }

  /**
   * Handle authentication failure
   */
  private async handleAuthFailure(
    request: FastifyRequest,
    code: string,
    message: string,
    details?: string
  ): Promise<void> {
    this.authStats.failedAuth++;

    // Track suspicious IPs
    if (this.options.security.blockSuspicious) {
      const ip = request.ip;
      const now = new Date();
      const suspicious = this.suspiciousIPs.get(ip) || { attempts: 0, lastAttempt: now };

      suspicious.attempts++;
      suspicious.lastAttempt = now;
      this.suspiciousIPs.set(ip, suspicious);
    }

    // Log authentication failure
    if (this.options.security.enableLogging) {
      await this.logAuthEvent({
        type: 'access_denied',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
        path: request.url,
        method: request.method,
        error: { code, message, details },
        timestamp: new Date(),
      });
    }

    logger.warn('Authentication failed', {
      code,
      message,
      details,
      path: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  /**
   * Log authentication events
   */
  private async logAuthEvent(event: AuthEvent): Promise<void> {
    try {
      // In production, you might want to store these in a separate events table
      // or send to an external monitoring service
      logger.info('Auth event', {
        type: event.type,
        userId: event.userId,
        businessId: event.businessId,
        ipAddress: event.ipAddress,
        path: event.path,
        method: event.method,
        error: event.error,
        timestamp: event.timestamp,
      });

      // You could also store in database:
      // await prisma.authEvent.create({ data: event });
    } catch (error) {
      logger.error('Failed to log auth event', {
        event: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get authentication statistics
   */
  getStats(): AuthStats {
    return { ...this.authStats };
  }

  /**
   * Reset authentication statistics
   */
  resetStats(): void {
    this.authStats = {
      totalRequests: 0,
      successfulAuth: 0,
      failedAuth: 0,
      rateLimited: 0,
      businessContextErrors: 0,
      lastReset: new Date(),
    };
  }
}

/**
 * Global auth pipeline instance
 */
let authPipeline: AuthPipeline | null = null;

/**
 * Create the authentication plugin
 */
const authPlugin: FastifyPluginAsync<AuthMiddlewareOptions> = async function (fastify, options) {
  // Initialize auth pipeline
  authPipeline = new AuthPipeline(options);

  // Register rate limiting if enabled
  if (options.enableRateLimit) {
    await fastify.register(rateLimit, {
      max: options.rateLimit?.max || 100,
      timeWindow: options.rateLimit?.windowMs || 15 * 60 * 1000,
      skipSuccessfulRequests: options.rateLimit?.skipSuccessfulRequests ?? true,
      onExceeding: req => {
        authPipeline!.authStats.rateLimited++;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      }),
    });
  }

  // Register authentication decorator
  fastify.decorate(
    'authenticate',
    async function (request: AuthenticatedRequest, reply: FastifyReply) {
      return authPipeline!.authenticate(request, reply);
    }
  );

  // Register route protection decorator
  fastify.decorate('protect', function (config: RouteProtectionConfig) {
    return async function (request: AuthenticatedRequest, reply: FastifyReply) {
      return authPipeline!.protectRoute(config, request, reply);
    };
  });

  // Add type declarations
  fastify.addHook('onRequest', async () => {
    // This hook ensures TypeScript knows about our decorators
  });
};

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: AuthenticatedRequest, reply: FastifyReply): Promise<void>;
    protect(
      config: RouteProtectionConfig
    ): (request: AuthenticatedRequest, reply: FastifyReply) => Promise<boolean>;
  }
}

export default fp(authPlugin, {
  name: 'auth-pipeline',
  dependencies: [],
});

/**
 * Get the current auth pipeline instance
 */
export function getAuthPipeline(): AuthPipeline | null {
  return authPipeline;
}
