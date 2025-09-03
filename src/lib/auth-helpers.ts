/**
 * Authentication Helpers and Route Protection Utilities
 *
 * Provides convenient decorators, hooks, and utility functions for protecting
 * routes and handling authentication in Fastify applications.
 */

import {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
  type RouteHandlerMethod,
} from 'fastify';
import { logger } from './logger';
import type {
  AuthenticatedRequest,
  AuthLevel,
  RouteProtectionConfig,
  AuthContext,
  AuthenticatedRouteHandler,
} from '../types/auth';

/**
 * Route protection decorator options
 */
interface ProtectedRouteOptions {
  level?: AuthLevel;
  permissions?: string[];
  validator?: (authContext: AuthContext) => Promise<boolean> | boolean;
  onUnauthorized?: (request: AuthenticatedRequest, reply: FastifyReply) => void;
  onForbidden?: (request: AuthenticatedRequest, reply: FastifyReply) => void;
}

/**
 * Create a protected route handler
 *
 * @param config - Protection configuration
 * @param handler - Route handler function
 * @returns Protected route handler
 */
export function createProtectedRoute(
  config: RouteProtectionConfig,
  handler: AuthenticatedRouteHandler
): RouteHandlerMethod {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;

    try {
      // Apply route protection
      const canProceed = await (this as FastifyInstance).protect(config)(authRequest, reply);

      if (canProceed === true) {
        // Protection passed, execute the handler
        await handler(authRequest, reply);
      }
      // If canProceed is not true, the protect function has already sent a response
    } catch (error) {
      logger.error('Protected route error', {
        path: request.url,
        method: request.method,
        userId: authRequest.clerkUserId,
        businessId: authRequest.businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!reply.sent) {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'ROUTE_ERROR',
            message: 'Internal server error',
          },
        });
      }
    }
  };
}

/**
 * Require authentication decorator
 *
 * @param options - Protection options
 * @returns Route decorator function
 */
export function requireAuth(options: ProtectedRouteOptions = {}) {
  return function (handler: AuthenticatedRouteHandler): RouteHandlerMethod {
    return createProtectedRoute(
      {
        level: options.level || 'required',
        permissions: options.permissions,
        validator: options.validator,
      },
      handler
    );
  };
}

/**
 * Require admin privileges decorator
 *
 * @param options - Additional protection options
 * @returns Route decorator function
 */
export function requireAdmin(options: Omit<ProtectedRouteOptions, 'level'> = {}) {
  return function (handler: AuthenticatedRouteHandler): RouteHandlerMethod {
    return createProtectedRoute(
      {
        level: 'admin',
        permissions: options.permissions,
        validator: options.validator,
      },
      handler
    );
  };
}

/**
 * Require specific permissions decorator
 *
 * @param permissions - Required permissions
 * @param options - Additional protection options
 * @returns Route decorator function
 */
export function requirePermissions(
  permissions: string[],
  options: Omit<ProtectedRouteOptions, 'permissions'> = {}
) {
  return function (handler: AuthenticatedRouteHandler): RouteHandlerMethod {
    return createProtectedRoute(
      {
        level: options.level || 'required',
        permissions,
        validator: options.validator,
      },
      handler
    );
  };
}

/**
 * Optional authentication decorator
 * Sets auth context if token is provided, but doesn't require it
 *
 * @param handler - Route handler function
 * @returns Route handler with optional auth
 */
export function optionalAuth(handler: AuthenticatedRouteHandler): RouteHandlerMethod {
  return createProtectedRoute({ level: 'optional' }, handler);
}

/**
 * Public route decorator
 * Explicitly marks a route as public (no authentication required)
 *
 * @param handler - Route handler function
 * @returns Public route handler
 */
export function publicRoute(handler: AuthenticatedRouteHandler): RouteHandlerMethod {
  return createProtectedRoute({ level: 'none' }, handler);
}

/**
 * Business owner only decorator
 * Requires user to be the owner of the business
 *
 * @param handler - Route handler function
 * @returns Protected route handler
 */
export function requireBusinessOwner(handler: AuthenticatedRouteHandler): RouteHandlerMethod {
  return createProtectedRoute(
    {
      level: 'required',
      validator: async (authContext: AuthContext) => {
        return authContext.business.role === 'owner';
      },
    },
    handler
  );
}

/**
 * Same business validation decorator
 * Ensures the user can only access resources from their own business
 *
 * @param getResourceBusinessId - Function to extract business ID from request
 * @param handler - Route handler function
 * @returns Protected route handler
 */
export function requireSameBusiness(
  getResourceBusinessId: (request: AuthenticatedRequest) => string | Promise<string>,
  handler: AuthenticatedRouteHandler
): RouteHandlerMethod {
  return createProtectedRoute(
    {
      level: 'required',
      validator: async (authContext: AuthContext, request?: AuthenticatedRequest) => {
        if (!request) return false;

        try {
          const resourceBusinessId = await getResourceBusinessId(request);
          return authContext.business.businessId === resourceBusinessId;
        } catch (error) {
          logger.error('Error validating business access', {
            userId: authContext.user.clerkUserId,
            businessId: authContext.business.businessId,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      },
    },
    handler
  );
}

/**
 * Rate limited route decorator
 * Applies additional rate limiting to specific routes
 *
 * @param options - Rate limiting options
 * @param handler - Route handler function
 * @returns Rate limited route handler
 */
export function rateLimited(
  options: { max: number; windowMs: number; level?: AuthLevel },
  handler: AuthenticatedRouteHandler
): RouteHandlerMethod {
  return createProtectedRoute(
    {
      level: options.level || 'required',
      rateLimit: {
        max: options.max,
        windowMs: options.windowMs,
      },
    },
    handler
  );
}

/**
 * Utility functions for checking authentication status
 */
export class AuthUtils {
  /**
   * Check if user is authenticated
   */
  static isAuthenticated(request: AuthenticatedRequest): boolean {
    return !!request.auth && !!request.user && !!request.businessId;
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(request: AuthenticatedRequest, permission: string): boolean {
    if (!this.isAuthenticated(request)) return false;
    return request.auth!.business.permissions?.includes(permission) || false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  static hasAnyPermission(request: AuthenticatedRequest, permissions: string[]): boolean {
    if (!this.isAuthenticated(request)) return false;
    const userPermissions = request.auth!.business.permissions || [];
    return permissions.some(permission => userPermissions.includes(permission));
  }

  /**
   * Check if user has all specified permissions
   */
  static hasAllPermissions(request: AuthenticatedRequest, permissions: string[]): boolean {
    if (!this.isAuthenticated(request)) return false;
    const userPermissions = request.auth!.business.permissions || [];
    return permissions.every(permission => userPermissions.includes(permission));
  }

  /**
   * Check if user is business owner
   */
  static isBusinessOwner(request: AuthenticatedRequest): boolean {
    if (!this.isAuthenticated(request)) return false;
    return request.auth!.business.role === 'owner';
  }

  /**
   * Check if user is business admin or owner
   */
  static isBusinessAdmin(request: AuthenticatedRequest): boolean {
    if (!this.isAuthenticated(request)) return false;
    const role = request.auth!.business.role;
    return role === 'owner' || role === 'admin';
  }

  /**
   * Get user's business role
   */
  static getUserRole(request: AuthenticatedRequest): string | undefined {
    if (!this.isAuthenticated(request)) return undefined;
    return request.auth!.business.role;
  }

  /**
   * Get user's permissions
   */
  static getUserPermissions(request: AuthenticatedRequest): string[] {
    if (!this.isAuthenticated(request)) return [];
    return request.auth!.business.permissions || [];
  }

  /**
   * Validate business access for resource
   */
  static validateBusinessAccess(
    request: AuthenticatedRequest,
    resourceBusinessId: string
  ): boolean {
    if (!this.isAuthenticated(request)) return false;
    return request.auth!.business.businessId === resourceBusinessId;
  }

  /**
   * Get authentication error response
   */
  static createAuthError(
    code: string,
    message: string,
    statusCode: number = 401
  ): {
    statusCode: number;
    response: {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };
  } {
    return {
      statusCode,
      response: {
        success: false,
        error: { code, message },
      },
    };
  }
}

/**
 * Pre-handler hook for automatic authentication
 *
 * @param options - Authentication options
 * @returns Fastify pre-handler hook
 */
export function authPreHandler(options: ProtectedRouteOptions = {}) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;

    // Run authentication middleware
    await (this as FastifyInstance).authenticate(authRequest, reply);

    // If authentication is required but not present, stop here
    if (options.level === 'required' && !AuthUtils.isAuthenticated(authRequest)) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'This endpoint requires authentication',
        },
      });
    }

    // Check permissions if specified
    if (options.permissions && options.permissions.length > 0) {
      if (!AuthUtils.hasAllPermissions(authRequest, options.permissions)) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Insufficient permissions for this operation',
            details: `Required: ${options.permissions.join(', ')}`,
          },
        });
      }
    }

    // Run custom validator if provided
    if (options.validator && AuthUtils.isAuthenticated(authRequest)) {
      const isValid = await options.validator(authRequest.auth!);
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
  };
}

/**
 * Create a route schema with authentication requirements
 *
 * @param config - Route protection configuration
 * @returns Fastify route schema with auth requirements
 */
export function createAuthSchema(config: RouteProtectionConfig) {
  const schema: any = {
    security: [],
    response: {
      401: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  };

  if (config.level !== 'none') {
    schema.security.push({ bearerAuth: [] });
  }

  if (config.level === 'admin' || (config.permissions && config.permissions.length > 0)) {
    schema.response[403] = {
      type: 'object',
      properties: {
        success: { type: 'boolean', const: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    };
  }

  return schema;
}

/**
 * Middleware registration helper
 *
 * @param fastify - Fastify instance
 * @param options - Authentication middleware options
 */
export async function registerAuthHelpers(
  fastify: FastifyInstance,
  options: { enableGlobalAuth?: boolean } = {}
) {
  // Register global authentication hook if enabled
  if (options.enableGlobalAuth) {
    fastify.addHook('preHandler', async (request, reply) => {
      await fastify.authenticate(request as AuthenticatedRequest, reply);
    });
  }

  // Add utility decorators
  fastify.decorate('AuthUtils', AuthUtils);
  fastify.decorate('requireAuth', requireAuth);
  fastify.decorate('requireAdmin', requireAdmin);
  fastify.decorate('requirePermissions', requirePermissions);
  fastify.decorate('optionalAuth', optionalAuth);
  fastify.decorate('publicRoute', publicRoute);
}

// Extend Fastify types for utility decorators
declare module 'fastify' {
  interface FastifyInstance {
    AuthUtils: typeof AuthUtils;
    requireAuth: typeof requireAuth;
    requireAdmin: typeof requireAdmin;
    requirePermissions: typeof requirePermissions;
    optionalAuth: typeof optionalAuth;
    publicRoute: typeof publicRoute;
  }
}
