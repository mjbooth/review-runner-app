/**
 * Complete Server Setup Example with Authentication Integration
 *
 * This example shows how to set up a Fastify server with the complete
 * authentication system including Clerk JWT validation, business context,
 * and Row Level Security integration.
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { logger } from '../lib/logger';

// Authentication imports
import authPipelinePlugin from './middleware/auth-pipeline';
import { registerAuthHelpers } from '../lib/auth-helpers';
import type { AuthMiddlewareOptions } from '../types/auth';

// Route imports
import healthRoutes from './routes/health';
import customerRoutes from './routes/customers-auth-example';
import businessRoutes from './routes/businesses';
import reviewRequestRoutes from './routes/review-requests';
import analyticsRoutes from './routes/analytics';
import suppressionRoutes from './routes/suppressions';
import webhookRoutes from './routes/webhooks';
import redirectRoutes from './routes/redirects';

/**
 * Server configuration
 */
interface ServerConfig {
  port: number;
  host: string;
  environment: 'development' | 'production' | 'test';
  auth: {
    clerkSecretKey: string;
    clerkPublishableKey: string;
    enableRateLimit: boolean;
    enableGlobalAuth: boolean;
    allowNoBusiness: boolean;
  };
  cors: {
    origin: string[] | boolean;
    credentials: boolean;
  };
}

/**
 * Create and configure Fastify server
 */
export async function createServer(config: ServerConfig): Promise<FastifyInstance> {
  // Create Fastify instance with logging
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      stream: {
        write: (msg: string) => {
          const logData = JSON.parse(msg.trim());
          logger.info(logData.msg, {
            level: logData.level,
            time: logData.time,
            pid: logData.pid,
            hostname: logData.hostname,
            reqId: logData.reqId,
            ...logData,
          });
        },
      },
    },
  });

  // ==========================================
  // REGISTER CORE PLUGINS
  // ==========================================

  // CORS support
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Business-Id', // Custom header for business context
    ],
  });

  // Multipart form support
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // ==========================================
  // REGISTER AUTHENTICATION SYSTEM
  // ==========================================

  // Authentication pipeline configuration
  const authOptions: AuthMiddlewareOptions = {
    // Skip authentication for these paths
    skipPaths: [
      '/health',
      '/health/deep',
      '/r/', // Review request redirects
      '/webhooks/', // Webhook endpoints
      '/docs', // API documentation (if enabled)
    ],

    // Rate limiting configuration
    enableRateLimit: config.auth.enableRateLimit,
    rateLimit: {
      max: config.environment === 'production' ? 100 : 1000,
      windowMs: 15 * 60 * 1000, // 15 minutes
      skipSuccessfulRequests: true,
    },

    // JWT validation options
    jwtOptions: {
      algorithms: ['RS256'],
      // You can add audience/issuer validation here
    },

    // Business context configuration
    businessContext: {
      allowNoBusiness: config.auth.allowNoBusiness,
      cacheDuration: 5 * 60 * 1000, // 5 minutes
    },

    // Security options
    security: {
      enableLogging: true,
      blockSuspicious: config.environment === 'production',
      maxFailedAttempts: 10,
    },
  };

  // Register authentication pipeline
  await fastify.register(authPipelinePlugin, authOptions);

  // Register authentication helpers
  await registerAuthHelpers(fastify, {
    enableGlobalAuth: config.auth.enableGlobalAuth,
  });

  // ==========================================
  // REGISTER ROUTES WITH AUTHENTICATION
  // ==========================================

  // Health checks (public)
  await fastify.register(healthRoutes, { prefix: '/health' });

  // Redirect endpoints (public, but with tracking)
  await fastify.register(redirectRoutes, { prefix: '/r' });

  // Webhook endpoints (public with signature verification)
  await fastify.register(webhookRoutes, { prefix: '/webhooks' });

  // API routes (all require authentication)
  await fastify.register(
    async function (fastify) {
      // Add authentication pre-handler for all API routes
      fastify.addHook('preHandler', async (request, reply) => {
        // Skip auth for specific API endpoints if needed
        if (request.url.includes('/public')) {
          return;
        }

        // Apply authentication to all other API routes
        await fastify.authenticate(request, reply);
      });

      // Business management routes
      await fastify.register(businessRoutes, { prefix: '/businesses' });

      // Customer management routes (with full auth example)
      await fastify.register(customerRoutes, { prefix: '/customers' });

      // Review request/campaign routes
      await fastify.register(reviewRequestRoutes, { prefix: '/review-requests' });

      // Analytics routes
      await fastify.register(analyticsRoutes, { prefix: '/analytics' });

      // Suppression management routes
      await fastify.register(suppressionRoutes, { prefix: '/suppressions' });
    },
    { prefix: '/api' }
  );

  // ==========================================
  // GLOBAL ERROR HANDLING
  // ==========================================

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    const authRequest = request as any;

    // Log error with authentication context
    logger.error('Request error', {
      error: error.message,
      stack: error.stack,
      statusCode: error.statusCode || 500,
      path: request.url,
      method: request.method,
      userId: authRequest.clerkUserId,
      businessId: authRequest.businessId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // Handle authentication errors specifically
    if (error.name === 'ClerkJWTError' || error.name === 'AuthBusinessContextError') {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: config.environment === 'production' ? 'Authentication failed' : error.message,
        },
      });
    }

    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: config.environment === 'development' ? error.validation : undefined,
        },
      });
    }

    // Handle Prisma errors
    if (error.code?.startsWith('P')) {
      let message = 'Database error';
      let statusCode = 500;

      switch (error.code) {
        case 'P2025':
          message = 'Record not found';
          statusCode = 404;
          break;
        case 'P2002':
          message = 'Duplicate entry';
          statusCode = 409;
          break;
        case 'P2003':
          message = 'Foreign key constraint failed';
          statusCode = 400;
          break;
      }

      return reply.status(statusCode).send({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message,
          details: config.environment === 'development' ? error.message : undefined,
        },
      });
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message:
          config.environment === 'production' ? 'An unexpected error occurred' : error.message,
      },
    });
  });

  // ==========================================
  // GRACEFUL SHUTDOWN HANDLING
  // ==========================================

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      await fastify.close();
      logger.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // ==========================================
  // REQUEST/RESPONSE HOOKS FOR MONITORING
  // ==========================================

  // Request logging with auth context
  fastify.addHook('onRequest', async (request, reply) => {
    const startTime = Date.now();
    request.startTime = startTime;

    logger.debug('Request started', {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      startTime,
    });
  });

  // Response logging with auth context and performance metrics
  fastify.addHook('onResponse', async (request, reply) => {
    const authRequest = request as any;
    const duration = Date.now() - (request.startTime || 0);

    const logLevel = reply.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      ip: request.ip,
      userId: authRequest.clerkUserId,
      businessId: authRequest.businessId,
      userAgent: request.headers['user-agent'],
    });
  });

  return fastify;
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  // Load configuration from environment
  const config: ServerConfig = {
    port: parseInt(process.env.API_PORT || '3001'),
    host: process.env.API_HOST || '0.0.0.0',
    environment: (process.env.NODE_ENV as any) || 'development',

    auth: {
      clerkSecretKey: process.env.CLERK_SECRET_KEY!,
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
      enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
      enableGlobalAuth: process.env.ENABLE_GLOBAL_AUTH === 'true',
      allowNoBusiness: process.env.ALLOW_NO_BUSINESS === 'true',
    },

    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || true,
      credentials: true,
    },
  };

  // Validate required environment variables
  if (!config.auth.clerkSecretKey || !config.auth.clerkPublishableKey) {
    throw new Error('CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be set');
  }

  try {
    // Create and start server
    const server = await createServer(config);

    await server.listen({
      port: config.port,
      host: config.host,
    });

    logger.info('🚀 Server started successfully', {
      port: config.port,
      host: config.host,
      environment: config.environment,
      auth: {
        rateLimit: config.auth.enableRateLimit,
        globalAuth: config.auth.enableGlobalAuth,
        allowNoBusiness: config.auth.allowNoBusiness,
      },
    });

    // Log authentication system status
    logger.info('🔒 Authentication system active', {
      jwtValidation: 'Clerk',
      businessContext: 'Row Level Security',
      rateLimit: config.auth.enableRateLimit,
      securityLogging: true,
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch(error => {
    logger.error('Server startup failed', { error });
    process.exit(1);
  });
}

// Type extensions for request
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
