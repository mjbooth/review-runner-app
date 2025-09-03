/**
 * Centralized Error Handling System
 *
 * Comprehensive error handling with audit logging, security event tracking,
 * error classification, recovery strategies, and alerting integration.
 */

import { logger } from './logger';
import { auditLog, auditSecurity, getAuditLogger } from './audit-logger';
import type { AuthenticatedRequest } from '../types/auth';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ==========================================
// ERROR CLASSIFICATION
// ==========================================

export type ErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'business_rule'
  | 'rate_limiting'
  | 'database'
  | 'external_service'
  | 'security'
  | 'system'
  | 'network'
  | 'configuration';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  // Request context
  requestId?: string;
  method?: string;
  url?: string;
  userAgent?: string;
  ip?: string;

  // User context
  userId?: string;
  businessId?: string;
  sessionId?: string;

  // Operation context
  operation?: string;
  resource?: {
    type: string;
    id: string;
  };

  // Additional metadata
  metadata?: Record<string, any>;

  // Stack and debug info
  stack?: string;
  cause?: Error;
}

export interface ClassifiedError {
  // Error identification
  id: string;
  correlationId: string;

  // Classification
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;

  // Context
  context: ErrorContext;
  timestamp: Date;

  // Flags
  isRetryable: boolean;
  requiresAlert: boolean;
  isSecurityRelated: boolean;
  isPotentialAttack: boolean;

  // Response info
  httpStatusCode: number;
  publicMessage: string;

  // Recovery
  suggestedAction?: string;
  retryAfter?: number;
}

// ==========================================
// ERROR PATTERNS AND CLASSIFICATIONS
// ==========================================

interface ErrorPattern {
  matcher: (error: Error) => boolean;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  httpStatus: number;
  isRetryable: boolean;
  requiresAlert: boolean;
  isSecurityRelated: boolean;
  isPotentialAttack: boolean;
  publicMessage: string;
  suggestedAction?: string;
  retryAfter?: number;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Authentication errors
  {
    matcher: error => error.message?.includes('Invalid token') || error.message?.includes('jwt'),
    category: 'authentication',
    severity: 'medium',
    code: 'AUTH_TOKEN_INVALID',
    httpStatus: 401,
    isRetryable: false,
    requiresAlert: false,
    isSecurityRelated: true,
    isPotentialAttack: false,
    publicMessage: 'Authentication required',
  },

  {
    matcher: error => error.message?.includes('Unauthorized'),
    category: 'authentication',
    severity: 'medium',
    code: 'AUTH_UNAUTHORIZED',
    httpStatus: 401,
    isRetryable: false,
    requiresAlert: false,
    isSecurityRelated: true,
    isPotentialAttack: false,
    publicMessage: 'Authentication required',
  },

  // Authorization errors
  {
    matcher: error =>
      error.message?.includes('Access denied') || error.message?.includes('Forbidden'),
    category: 'authorization',
    severity: 'medium',
    code: 'AUTH_ACCESS_DENIED',
    httpStatus: 403,
    isRetryable: false,
    requiresAlert: false,
    isSecurityRelated: true,
    isPotentialAttack: true,
    publicMessage: 'Access denied',
  },

  // Validation errors
  {
    matcher: error => error.name === 'ZodError' || error.message?.includes('validation'),
    category: 'validation',
    severity: 'low',
    code: 'VALIDATION_FAILED',
    httpStatus: 400,
    isRetryable: false,
    requiresAlert: false,
    isSecurityRelated: false,
    isPotentialAttack: false,
    publicMessage: 'Invalid input data',
  },

  // Rate limiting errors
  {
    matcher: error =>
      error.message?.includes('rate limit') || (error as any).code === 'RATE_LIMITED',
    category: 'rate_limiting',
    severity: 'medium',
    code: 'RATE_LIMIT_EXCEEDED',
    httpStatus: 429,
    isRetryable: true,
    requiresAlert: false,
    isSecurityRelated: true,
    isPotentialAttack: true,
    publicMessage: 'Too many requests',
    retryAfter: 60,
  },

  // Database errors
  {
    matcher: error => (error as any).code?.startsWith('P') || error.message?.includes('database'),
    category: 'database',
    severity: 'high',
    code: 'DATABASE_ERROR',
    httpStatus: 500,
    isRetryable: true,
    requiresAlert: true,
    isSecurityRelated: false,
    isPotentialAttack: false,
    publicMessage: 'Database operation failed',
    suggestedAction: 'Check database connectivity and query validity',
    retryAfter: 30,
  },

  // External service errors
  {
    matcher: error =>
      error.message?.includes('fetch') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('timeout'),
    category: 'external_service',
    severity: 'medium',
    code: 'EXTERNAL_SERVICE_ERROR',
    httpStatus: 503,
    isRetryable: true,
    requiresAlert: true,
    isSecurityRelated: false,
    isPotentialAttack: false,
    publicMessage: 'External service unavailable',
    suggestedAction: 'Check external service status and network connectivity',
    retryAfter: 60,
  },

  // Security-related errors
  {
    matcher: error =>
      error.message?.includes('suspicious') ||
      error.message?.includes('malicious') ||
      error.message?.includes('attack'),
    category: 'security',
    severity: 'critical',
    code: 'SECURITY_THREAT',
    httpStatus: 400,
    isRetryable: false,
    requiresAlert: true,
    isSecurityRelated: true,
    isPotentialAttack: true,
    publicMessage: 'Request blocked for security reasons',
  },

  // Business rule violations
  {
    matcher: error =>
      error.message?.includes('business rule') || error.message?.includes('limit exceeded'),
    category: 'business_rule',
    severity: 'medium',
    code: 'BUSINESS_RULE_VIOLATION',
    httpStatus: 400,
    isRetryable: false,
    requiresAlert: false,
    isSecurityRelated: false,
    isPotentialAttack: false,
    publicMessage: 'Business rule violation',
  },

  // Network errors
  {
    matcher: error => error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNRESET'),
    category: 'network',
    severity: 'medium',
    code: 'NETWORK_ERROR',
    httpStatus: 503,
    isRetryable: true,
    requiresAlert: false,
    isSecurityRelated: false,
    isPotentialAttack: false,
    publicMessage: 'Network connectivity issue',
    retryAfter: 30,
  },

  // Default system error
  {
    matcher: () => true, // Catch-all
    category: 'system',
    severity: 'high',
    code: 'INTERNAL_ERROR',
    httpStatus: 500,
    isRetryable: false,
    requiresAlert: true,
    isSecurityRelated: false,
    isPotentialAttack: false,
    publicMessage: 'Internal server error',
    suggestedAction: 'Check application logs and system health',
  },
];

// ==========================================
// CENTRALIZED ERROR HANDLER
// ==========================================

export class CentralizedErrorHandler {
  private errorCounts: Map<string, { count: number; firstSeen: Date; lastSeen: Date }> = new Map();
  private alertThresholds: Map<ErrorCategory, number> = new Map([
    ['critical', 1],
    ['database', 5],
    ['external_service', 10],
    ['security', 1],
    ['authentication', 20],
    ['system', 3],
  ]);

  /**
   * Process and classify an error
   */
  async handleError(
    error: Error,
    context: ErrorContext,
    request?: FastifyRequest
  ): Promise<ClassifiedError> {
    try {
      // Generate error ID and correlation ID
      const errorId = this.generateErrorId();
      const correlationId = context.requestId || this.generateCorrelationId();

      // Classify the error
      const classification = this.classifyError(error);

      // Build classified error object
      const classifiedError: ClassifiedError = {
        id: errorId,
        correlationId,
        category: classification.category,
        severity: classification.severity,
        code: classification.code,
        message: error.message,
        context: {
          ...context,
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        },
        timestamp: new Date(),
        isRetryable: classification.isRetryable,
        requiresAlert: classification.requiresAlert,
        isSecurityRelated: classification.isSecurityRelated,
        isPotentialAttack: classification.isPotentialAttack,
        httpStatusCode: classification.httpStatus,
        publicMessage: classification.publicMessage,
        suggestedAction: classification.suggestedAction,
        retryAfter: classification.retryAfter,
      };

      // Track error frequency
      this.trackErrorFrequency(classifiedError);

      // Log to application logger
      this.logError(classifiedError, error);

      // Create audit log entry
      await this.auditError(classifiedError);

      // Handle security events
      if (classifiedError.isSecurityRelated) {
        await this.handleSecurityEvent(classifiedError, request);
      }

      // Check if alert is needed
      if (this.shouldAlert(classifiedError)) {
        await this.triggerAlert(classifiedError);
      }

      return classifiedError;
    } catch (handlingError) {
      // Error handling the error - log and create minimal response
      logger.error('Error handler failed', {
        originalError: error.message,
        handlingError:
          handlingError instanceof Error ? handlingError.message : String(handlingError),
        context,
      });

      return {
        id: this.generateErrorId(),
        correlationId: context.requestId || 'unknown',
        category: 'system',
        severity: 'critical',
        code: 'ERROR_HANDLER_FAILED',
        message: 'Error handling system failed',
        context,
        timestamp: new Date(),
        isRetryable: false,
        requiresAlert: true,
        isSecurityRelated: false,
        isPotentialAttack: false,
        httpStatusCode: 500,
        publicMessage: 'Internal server error',
      };
    }
  }

  /**
   * Create error response for API
   */
  createErrorResponse(classifiedError: ClassifiedError): {
    success: false;
    error: {
      code: string;
      message: string;
      correlationId: string;
      retryAfter?: number;
      suggestedAction?: string;
      details?: any;
    };
  } {
    const response = {
      success: false as const,
      error: {
        code: classifiedError.code,
        message: classifiedError.publicMessage,
        correlationId: classifiedError.correlationId,
        retryAfter: classifiedError.retryAfter,
        suggestedAction: classifiedError.suggestedAction,
        details:
          process.env.NODE_ENV === 'development'
            ? {
                category: classifiedError.category,
                severity: classifiedError.severity,
                timestamp: classifiedError.timestamp,
                stack: classifiedError.context.stack,
              }
            : undefined,
      },
    };

    return response;
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    topErrors: Array<{ code: string; count: number; category: string }>;
    recentErrors: Array<{ code: string; count: number; firstSeen: Date; lastSeen: Date }>;
  } {
    const stats = {
      totalErrors: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      topErrors: [] as Array<{ code: string; count: number; category: string }>,
      recentErrors: [] as Array<{ code: string; count: number; firstSeen: Date; lastSeen: Date }>,
    };

    // Convert error counts map to statistics
    for (const [errorCode, data] of this.errorCounts.entries()) {
      stats.totalErrors += data.count;
      stats.recentErrors.push({
        code: errorCode,
        count: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      });
    }

    // Sort recent errors by count
    stats.recentErrors.sort((a, b) => b.count - a.count);

    return stats;
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private classifyError(error: Error): ErrorPattern {
    // Find matching pattern
    const pattern = ERROR_PATTERNS.find(p => p.matcher(error));
    return pattern || ERROR_PATTERNS[ERROR_PATTERNS.length - 1]; // Default to last pattern (system error)
  }

  private trackErrorFrequency(classifiedError: ClassifiedError): void {
    const key = classifiedError.code;
    const existing = this.errorCounts.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = classifiedError.timestamp;
    } else {
      this.errorCounts.set(key, {
        count: 1,
        firstSeen: classifiedError.timestamp,
        lastSeen: classifiedError.timestamp,
      });
    }
  }

  private logError(classifiedError: ClassifiedError, originalError: Error): void {
    const logLevel = this.getLogLevel(classifiedError.severity);

    logger[logLevel]('Classified error occurred', {
      errorId: classifiedError.id,
      correlationId: classifiedError.correlationId,
      category: classifiedError.category,
      severity: classifiedError.severity,
      code: classifiedError.code,
      message: classifiedError.message,
      context: {
        ...classifiedError.context,
        stack: undefined, // Don't log stack in structured data
      },
      isRetryable: classifiedError.isRetryable,
      requiresAlert: classifiedError.requiresAlert,
      isSecurityRelated: classifiedError.isSecurityRelated,
      isPotentialAttack: classifiedError.isPotentialAttack,
      originalError: originalError.message,
    });

    // Log stack trace separately for errors
    if (classifiedError.severity === 'critical' || classifiedError.severity === 'high') {
      logger.error('Error stack trace', {
        errorId: classifiedError.id,
        stack: originalError.stack,
      });
    }
  }

  private async auditError(classifiedError: ClassifiedError): Promise<void> {
    try {
      await auditLog({
        category: 'system_event',
        type: 'SYSTEM_ERROR',
        severity: classifiedError.severity,
        description: `${classifiedError.category} error: ${classifiedError.message}`,
        userId: classifiedError.context.userId,
        businessId: classifiedError.context.businessId,
        context: {
          ip: classifiedError.context.ip,
          endpoint: classifiedError.context.url,
          method: classifiedError.context.method,
          userAgent: classifiedError.context.userAgent,
        },
        metadata: {
          errorId: classifiedError.id,
          errorCode: classifiedError.code,
          errorCategory: classifiedError.category,
          isRetryable: classifiedError.isRetryable,
          requiresAlert: classifiedError.requiresAlert,
          resource: classifiedError.context.resource,
          operation: classifiedError.context.operation,
        },
        flags: {
          suspicious: classifiedError.isPotentialAttack,
          requiresReview: classifiedError.requiresAlert,
        },
        correlationId: classifiedError.correlationId,
      });
    } catch (auditError) {
      logger.error('Failed to audit error event', {
        errorId: classifiedError.id,
        auditError: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
  }

  private async handleSecurityEvent(
    classifiedError: ClassifiedError,
    request?: FastifyRequest
  ): Promise<void> {
    try {
      // Map error category to audit event type
      const eventTypeMap = {
        authentication: 'LOGIN_FAILED' as const,
        authorization: 'ACCESS_DENIED' as const,
        security: 'SECURITY_VIOLATION' as const,
        rate_limiting: 'RATE_LIMIT_EXCEEDED' as const,
      };

      const eventType =
        eventTypeMap[classifiedError.category as keyof typeof eventTypeMap] ||
        ('SECURITY_VIOLATION' as const);

      await auditSecurity(
        eventType,
        `Security event: ${classifiedError.message}`,
        classifiedError.severity,
        {
          ip: classifiedError.context.ip || 'unknown',
          endpoint: classifiedError.context.url,
          userAgent: classifiedError.context.userAgent,
        },
        classifiedError.context.userId,
        classifiedError.context.businessId,
        {
          errorId: classifiedError.id,
          errorCode: classifiedError.code,
          isPotentialAttack: classifiedError.isPotentialAttack,
          resource: classifiedError.context.resource,
        }
      );

      // Additional security measures for potential attacks
      if (classifiedError.isPotentialAttack) {
        logger.warn('Potential attack detected', {
          errorId: classifiedError.id,
          ip: classifiedError.context.ip,
          userAgent: classifiedError.context.userAgent,
          endpoint: classifiedError.context.url,
          userId: classifiedError.context.userId,
          businessId: classifiedError.context.businessId,
        });

        // Could implement IP blocking, user account locking, etc.
      }
    } catch (securityHandlingError) {
      logger.error('Failed to handle security event', {
        errorId: classifiedError.id,
        securityHandlingError:
          securityHandlingError instanceof Error
            ? securityHandlingError.message
            : String(securityHandlingError),
      });
    }
  }

  private shouldAlert(classifiedError: ClassifiedError): boolean {
    if (!classifiedError.requiresAlert) return false;

    // Check frequency-based alerting
    const threshold = this.alertThresholds.get(classifiedError.category) || 10;
    const errorStats = this.errorCounts.get(classifiedError.code);

    if (errorStats && errorStats.count >= threshold) {
      return true;
    }

    // Always alert for critical errors
    return classifiedError.severity === 'critical';
  }

  private async triggerAlert(classifiedError: ClassifiedError): Promise<void> {
    try {
      // Log alert trigger
      logger.warn('Error alert triggered', {
        errorId: classifiedError.id,
        category: classifiedError.category,
        severity: classifiedError.severity,
        code: classifiedError.code,
        message: classifiedError.message,
        context: classifiedError.context,
      });

      // Here you would integrate with alerting systems:
      // - Send to Slack/Discord
      // - Send email notifications
      // - Trigger PagerDuty/OpsGenie
      // - Post to monitoring dashboards

      // For now, we'll create a high-priority audit log
      await auditLog({
        category: 'system_event',
        type: 'SYSTEM_ERROR',
        severity: 'critical',
        description: `ALERT: ${classifiedError.category} error requiring attention`,
        businessId: classifiedError.context.businessId,
        context: {
          ip: classifiedError.context.ip,
        },
        metadata: {
          alertTriggered: true,
          errorId: classifiedError.id,
          errorCode: classifiedError.code,
          errorMessage: classifiedError.message,
        },
        flags: {
          requiresReview: true,
        },
        correlationId: classifiedError.correlationId,
      });
    } catch (alertError) {
      logger.error('Failed to trigger error alert', {
        errorId: classifiedError.id,
        alertError: alertError instanceof Error ? alertError.message : String(alertError),
      });
    }
  }

  private getLogLevel(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      default:
        return 'debug';
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ==========================================
// SINGLETON AND CONVENIENCE FUNCTIONS
// ==========================================

let globalErrorHandler: CentralizedErrorHandler | null = null;

/**
 * Get global error handler instance
 */
export function getErrorHandler(): CentralizedErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new CentralizedErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * Quick error handling function
 */
export async function handleError(
  error: Error,
  context: ErrorContext,
  request?: FastifyRequest
): Promise<ClassifiedError> {
  const errorHandler = getErrorHandler();
  return errorHandler.handleError(error, context, request);
}

/**
 * Create Fastify error handler plugin
 */
export function createFastifyErrorHandler() {
  return async function fastifyErrorHandler(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const authRequest = request as AuthenticatedRequest;

    const context: ErrorContext = {
      requestId: (request as any).id,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: authRequest.clerkUserId,
      businessId: authRequest.businessId,
      sessionId: (authRequest as any).sessionId,
      metadata: {
        headers: Object.keys(request.headers),
        params: request.params,
        query: request.query,
      },
    };

    try {
      const classifiedError = await handleError(error, context, request);
      const response = getErrorHandler().createErrorResponse(classifiedError);

      return reply.status(classifiedError.httpStatusCode).send(response);
    } catch (handlingError) {
      logger.error('Critical: Error handler completely failed', {
        originalError: error.message,
        handlingError:
          handlingError instanceof Error ? handlingError.message : String(handlingError),
        requestId: context.requestId,
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'SYSTEM_FAILURE',
          message: 'System temporarily unavailable',
          correlationId: context.requestId || 'unknown',
        },
      });
    }
  };
}

/**
 * Create error context from request
 */
export function createErrorContext(request: FastifyRequest, operation?: string): ErrorContext {
  const authRequest = request as AuthenticatedRequest;

  return {
    requestId: (request as any).id,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    userId: authRequest.clerkUserId,
    businessId: authRequest.businessId,
    operation,
    metadata: {
      params: request.params,
      query: request.query,
    },
  };
}
