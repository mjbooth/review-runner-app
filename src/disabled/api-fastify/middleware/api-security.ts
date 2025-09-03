/**
 * API Security Middleware
 *
 * Comprehensive security middleware for API responses including headers,
 * response data minimization, error message sanitization, and request
 * size limits to prevent attacks and information disclosure.
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../types/auth';

// ==========================================
// SECURITY CONFIGURATION
// ==========================================

export const SECURITY_CONFIG = {
  // Request size limits
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  maxJsonPayload: 5 * 1024 * 1024, // 5MB
  maxMultipartFileSize: 10 * 1024 * 1024, // 10MB
  maxUrlLength: 2048,
  maxHeaderSize: 8192,

  // Response limits
  maxResponseSize: 50 * 1024 * 1024, // 50MB
  maxArrayItems: 1000,
  maxNestingDepth: 10,

  // Rate limiting
  maxRequestsPerSecond: 100,
  maxConcurrentRequests: 50,

  // Security headers
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
  },

  // HSTS for HTTPS
  hstsMaxAge: 31536000, // 1 year
  hstsIncludeSubDomains: true,
  hstsPreload: true,

  // Content Security Policy
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "media-src 'self'",
    "frame-src 'none'",
  ].join('; '),
} as const;

// ==========================================
// REQUEST SIZE VALIDATION
// ==========================================

/**
 * Validate request size and structure
 */
export function createRequestValidationMiddleware(
  options: {
    maxSize?: number;
    maxUrlLength?: number;
    maxHeaders?: number;
  } = {}
) {
  const {
    maxSize = SECURITY_CONFIG.maxRequestSize,
    maxUrlLength = SECURITY_CONFIG.maxUrlLength,
    maxHeaders = SECURITY_CONFIG.maxHeaderSize,
  } = options;

  return async function requestValidationMiddleware(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Validate URL length
      if (request.url.length > maxUrlLength) {
        logger.warn('Request URL too long', {
          url: request.url.substring(0, 100) + '...',
          length: request.url.length,
          maxLength: maxUrlLength,
          ip: request.ip,
        });

        return reply.status(414).send({
          success: false,
          error: {
            code: 'URL_TOO_LONG',
            message: 'Request URL is too long',
          },
        });
      }

      // Validate headers size
      const headersSize = JSON.stringify(request.headers).length;
      if (headersSize > maxHeaders) {
        logger.warn('Request headers too large', {
          size: headersSize,
          maxSize: maxHeaders,
          ip: request.ip,
          path: request.url,
        });

        return reply.status(431).send({
          success: false,
          error: {
            code: 'HEADERS_TOO_LARGE',
            message: 'Request headers are too large',
          },
        });
      }

      // Validate content length if present
      const contentLength = request.headers['content-length'];
      if (contentLength && parseInt(contentLength, 10) > maxSize) {
        logger.warn('Request payload too large', {
          contentLength: parseInt(contentLength, 10),
          maxSize,
          ip: request.ip,
          path: request.url,
        });

        return reply.status(413).send({
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload is too large',
          },
        });
      }

      // Validate for suspicious patterns in headers
      const suspiciousPatterns = [
        /<script[^>]*>/i,
        /javascript:/i,
        /data:text\/html/i,
        /vbscript:/i,
      ];

      for (const [headerName, headerValue] of Object.entries(request.headers)) {
        if (typeof headerValue === 'string') {
          if (suspiciousPatterns.some(pattern => pattern.test(headerValue))) {
            logger.warn('Suspicious header content detected', {
              header: headerName,
              value: headerValue.substring(0, 100),
              ip: request.ip,
              path: request.url,
            });

            return reply.status(400).send({
              success: false,
              error: {
                code: 'SUSPICIOUS_HEADER',
                message: 'Request contains suspicious header content',
              },
            });
          }
        }
      }
    } catch (error) {
      logger.error('Request validation error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.url,
        ip: request.ip,
      });

      return reply.status(400).send({
        success: false,
        error: {
          code: 'REQUEST_VALIDATION_ERROR',
          message: 'Request validation failed',
        },
      });
    }
  };
}

// ==========================================
// SECURITY HEADERS MIDDLEWARE
// ==========================================

/**
 * Add security headers to responses
 */
export function createSecurityHeadersMiddleware(
  options: {
    environment?: 'development' | 'production';
    customHeaders?: Record<string, string>;
    enableCSP?: boolean;
    enableHSTS?: boolean;
  } = {}
) {
  const {
    environment = process.env.NODE_ENV === 'production' ? 'production' : 'development',
    customHeaders = {},
    enableCSP = environment === 'production',
    enableHSTS = environment === 'production',
  } = options;

  return async function securityHeadersMiddleware(request: FastifyRequest, reply: FastifyReply) {
    // Add standard security headers
    Object.entries(SECURITY_CONFIG.securityHeaders).forEach(([header, value]) => {
      reply.header(header, value);
    });

    // Add HSTS for HTTPS in production
    if (enableHSTS && request.protocol === 'https') {
      const hstsValue = [
        `max-age=${SECURITY_CONFIG.hstsMaxAge}`,
        SECURITY_CONFIG.hstsIncludeSubDomains ? 'includeSubDomains' : '',
        SECURITY_CONFIG.hstsPreload ? 'preload' : '',
      ]
        .filter(Boolean)
        .join('; ');

      reply.header('Strict-Transport-Security', hstsValue);
    }

    // Add Content Security Policy
    if (enableCSP) {
      reply.header('Content-Security-Policy', SECURITY_CONFIG.contentSecurityPolicy);
    }

    // Add custom headers
    Object.entries(customHeaders).forEach(([header, value]) => {
      reply.header(header, value);
    });

    // Add API-specific headers
    reply.header('X-API-Version', '1.0');
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');

    // Add request ID for tracking
    const requestId = (request as any).id || generateRequestId();
    reply.header('X-Request-ID', requestId);

    // Add business context header if available
    const authRequest = request as AuthenticatedRequest;
    if (authRequest.businessId) {
      reply.header('X-Business-Context', 'set');
    }
  };
}

// ==========================================
// RESPONSE DATA MINIMIZATION
// ==========================================

/**
 * Minimize response data based on request needs
 */
export function createResponseMinimizationMiddleware(
  options: {
    maxArrayItems?: number;
    maxNestingDepth?: number;
    defaultFields?: string[];
    sensitiveFields?: string[];
  } = {}
) {
  const {
    maxArrayItems = SECURITY_CONFIG.maxArrayItems,
    maxNestingDepth = SECURITY_CONFIG.maxNestingDepth,
    defaultFields = [],
    sensitiveFields = ['password', 'secret', 'token', 'key', 'clerkUserId'],
  } = options;

  return function responseMinimizationTransform(payload: any, request: FastifyRequest): any {
    try {
      if (!payload || typeof payload !== 'object') {
        return payload;
      }

      // Get requested fields from query parameters
      const fieldsParam = (request.query as any)?.fields;
      const requestedFields = fieldsParam
        ? fieldsParam.split(',').map((f: string) => f.trim())
        : null;

      return minimizeObject(payload, {
        requestedFields,
        maxArrayItems,
        maxNestingDepth,
        sensitiveFields,
        currentDepth: 0,
      });
    } catch (error) {
      logger.error('Response minimization error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.url,
      });

      // Return original payload if minimization fails
      return payload;
    }
  };
}

/**
 * Recursively minimize object based on options
 */
function minimizeObject(
  obj: any,
  options: {
    requestedFields?: string[] | null;
    maxArrayItems: number;
    maxNestingDepth: number;
    sensitiveFields: string[];
    currentDepth: number;
  }
): any {
  const { requestedFields, maxArrayItems, maxNestingDepth, sensitiveFields, currentDepth } =
    options;

  // Prevent infinite recursion
  if (currentDepth > maxNestingDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    const limitedArray = obj.slice(0, maxArrayItems);
    return limitedArray.map(item =>
      minimizeObject(item, { ...options, currentDepth: currentDepth + 1 })
    );
  }

  // Handle objects
  if (obj && typeof obj === 'object') {
    const result: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip sensitive fields
      if (sensitiveFields.includes(key.toLowerCase())) {
        continue;
      }

      // Include field if requested fields is null or key is in requested fields
      if (!requestedFields || requestedFields.includes(key)) {
        result[key] = minimizeObject(value, { ...options, currentDepth: currentDepth + 1 });
      }
    }

    return result;
  }

  return obj;
}

// ==========================================
// ERROR MESSAGE SANITIZATION
// ==========================================

/**
 * Sanitize error messages to prevent information disclosure
 */
export function createErrorSanitizationMiddleware(
  options: {
    environment?: 'development' | 'production';
    logOriginalErrors?: boolean;
  } = {}
) {
  const {
    environment = process.env.NODE_ENV === 'production' ? 'production' : 'development',
    logOriginalErrors = true,
  } = options;

  return function sanitizeError(error: any, request: FastifyRequest): any {
    const authRequest = request as AuthenticatedRequest;

    // Log original error for debugging
    if (logOriginalErrors) {
      logger.error('API error occurred', {
        error: error.message,
        stack: error.stack,
        statusCode: error.statusCode,
        path: request.url,
        method: request.method,
        businessId: authRequest.businessId,
        userId: authRequest.clerkUserId,
        ip: request.ip,
      });
    }

    // In production, sanitize error messages
    if (environment === 'production') {
      // Database-specific errors
      if (error.code?.startsWith('P')) {
        // Prisma errors
        return {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'A database error occurred',
          },
        };
      }

      // Validation errors (keep these as they're user-facing)
      if (error.validation || error.name === 'ZodError') {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.validation || error.issues,
          },
        };
      }

      // Authentication/Authorization errors (sanitize)
      if ([401, 403].includes(error.statusCode)) {
        return {
          success: false,
          error: {
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
            message: error.statusCode === 401 ? 'Authentication required' : 'Access denied',
          },
        };
      }

      // Rate limiting errors (keep informative)
      if (error.statusCode === 429) {
        return {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            retryAfter: error.retryAfter,
          },
        };
      }

      // Generic server errors (sanitize)
      if (error.statusCode >= 500) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An internal server error occurred',
          },
        };
      }

      // Client errors (pass through with sanitization)
      return {
        success: false,
        error: {
          code: error.code || 'CLIENT_ERROR',
          message: sanitizeErrorMessage(error.message || 'An error occurred'),
        },
      };
    }

    // In development, return full error details
    return {
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message,
        details: error.details,
        stack: environment === 'development' ? error.stack : undefined,
      },
    };
  };
}

/**
 * Sanitize individual error message
 */
function sanitizeErrorMessage(message: string): string {
  // Remove file paths
  message = message.replace(/\/[^\s]+/g, '[PATH]');

  // Remove stack traces
  message = message.replace(/\s+at\s+.+/g, '');

  // Remove sensitive patterns
  const sensitivePatterns = [/password/gi, /secret/gi, /token/gi, /key/gi, /connection/gi];

  sensitivePatterns.forEach(pattern => {
    message = message.replace(pattern, '[REDACTED]');
  });

  return message.trim();
}

// ==========================================
// RESPONSE SIZE CONTROL
// ==========================================

/**
 * Control response size to prevent large payload attacks
 */
export function createResponseSizeMiddleware(
  options: {
    maxSize?: number;
    compressionLevel?: number;
  } = {}
) {
  const { maxSize = SECURITY_CONFIG.maxResponseSize, compressionLevel = 6 } = options;

  return async function responseSizeMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: any
  ) {
    try {
      const payloadSize = JSON.stringify(payload).length;

      if (payloadSize > maxSize) {
        logger.warn('Response payload too large', {
          size: payloadSize,
          maxSize,
          path: request.url,
          businessId: (request as AuthenticatedRequest).businessId,
        });

        return {
          success: false,
          error: {
            code: 'RESPONSE_TOO_LARGE',
            message: 'Response payload is too large',
            details: {
              size: payloadSize,
              maxSize,
              suggestion: 'Use pagination or field selection to reduce response size',
            },
          },
        };
      }

      // Add size header for debugging
      reply.header('X-Response-Size', payloadSize.toString());

      // Enable compression for large responses
      if (payloadSize > 1024) {
        reply.header('Content-Encoding', 'gzip');
      }

      return payload;
    } catch (error) {
      logger.error('Response size control error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.url,
      });

      return payload;
    }
  };
}

// ==========================================
// MAIN SECURITY PLUGIN
// ==========================================

const apiSecurityPlugin: FastifyPluginAsync<{
  environment?: 'development' | 'production';
  enableRequestValidation?: boolean;
  enableSecurityHeaders?: boolean;
  enableResponseMinimization?: boolean;
  enableErrorSanitization?: boolean;
  enableResponseSizeControl?: boolean;
}> = async function (fastify, options) {
  const {
    environment = process.env.NODE_ENV === 'production' ? 'production' : 'development',
    enableRequestValidation = true,
    enableSecurityHeaders = true,
    enableResponseMinimization = true,
    enableErrorSanitization = true,
    enableResponseSizeControl = true,
  } = options;

  // Request validation middleware
  if (enableRequestValidation) {
    fastify.addHook('preHandler', createRequestValidationMiddleware());
  }

  // Security headers middleware
  if (enableSecurityHeaders) {
    fastify.addHook('onRequest', createSecurityHeadersMiddleware({ environment }));
  }

  // Response minimization
  if (enableResponseMinimization) {
    fastify.addHook('preSerialization', async (request, reply, payload) => {
      const minimizer = createResponseMinimizationMiddleware();
      return minimizer(payload, request);
    });
  }

  // Response size control
  if (enableResponseSizeControl) {
    fastify.addHook('preSerialization', async (request, reply, payload) => {
      const sizeController = createResponseSizeMiddleware();
      return await sizeController(request, reply, payload);
    });
  }

  // Error sanitization
  if (enableErrorSanitization) {
    fastify.setErrorHandler((error, request, reply) => {
      const sanitizer = createErrorSanitizationMiddleware({ environment });
      const sanitizedError = sanitizer(error, request);

      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send(sanitizedError);
    });
  }

  // Request ID generation
  fastify.addHook('onRequest', async (request, reply) => {
    (request as any).id = generateRequestId();
  });

  logger.info('API Security middleware registered', {
    environment,
    features: {
      requestValidation: enableRequestValidation,
      securityHeaders: enableSecurityHeaders,
      responseMinimization: enableResponseMinimization,
      errorSanitization: enableErrorSanitization,
      responseSizeControl: enableResponseSizeControl,
    },
  });
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Check if request is from development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Check if HTTPS is required
 */
export function requiresHTTPS(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.REQUIRE_HTTPS !== 'false';
}

export default fp(apiSecurityPlugin, {
  name: 'api-security',
  dependencies: [],
});
