import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Create base logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: logLevel,
  formatters: {
    level: label => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction
    ? {
        // Production: JSON output for log aggregation
        serializers: pino.stdSerializers,
      }
    : {
        // Development: Pretty printing
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: false,
            hideObject: false,
          },
        },
      }),
};

// Create logger instance
export const logger = pino(loggerConfig);

// Child logger factory for adding consistent context
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

// Structured logging helpers
export const loggers = {
  // API request logging
  api: {
    request: (data: {
      method: string;
      url: string;
      businessId?: string;
      userId?: string;
      userAgent?: string;
      ip?: string;
    }) => {
      logger.info({ ...data, event: 'API Request' });
    },

    response: (data: {
      method: string;
      url: string;
      statusCode: number;
      duration: number;
      businessId?: string;
      userId?: string;
    }) => {
      logger.info({ ...data, event: 'API Response' });
    },

    error: (data: {
      method: string;
      url: string;
      error: unknown;
      businessId?: string;
      userId?: string;
    }) => {
      logger.error({ ...data, event: 'API Error' });
    },
  },

  // Business logic logging
  business: {
    reviewRequestCreated: (data: {
      requestId: string;
      businessId: string;
      customerId: string;
      channel: string;
    }) => {
      logger.info({ ...data, event: 'Review request created' });
    },

    reviewRequestSent: (data: {
      requestId: string;
      businessId: string;
      channel: string;
      externalId?: string;
    }) => {
      logger.info({ ...data, event: 'Review request sent' });
    },

    reviewRequestClicked: (data: {
      requestId: string;
      businessId: string;
      userAgent?: string;
      ip?: string;
    }) => {
      logger.info({ ...data, event: 'Review request clicked' });
    },

    suppressionAdded: (data: {
      businessId: string;
      contact: string;
      channel?: string;
      reason: string;
    }) => {
      logger.info({ ...data, event: 'Suppression added' });
    },
  },

  // External service logging
  external: {
    twilioRequest: (data: { to: string; requestId?: string; businessId?: string }) => {
      logger.info({ ...data, event: 'Twilio SMS request' });
    },

    twilioResponse: (data: {
      messageId: string;
      status: string;
      requestId?: string;
      businessId?: string;
      error?: string;
    }) => {
      logger.info({ ...data, event: 'Twilio SMS response' });
    },

    sendgridRequest: (data: {
      to: string;
      subject: string;
      requestId?: string;
      businessId?: string;
    }) => {
      logger.info({ ...data, event: 'SendGrid email request' });
    },

    sendgridResponse: (data: {
      statusCode: number;
      requestId?: string;
      businessId?: string;
      error?: string;
    }) => {
      logger.info({ ...data, event: 'SendGrid email response' });
    },

    webhookReceived: (data: {
      source: string;
      type?: string;
      businessId?: string;
      requestId?: string;
    }) => {
      logger.info({ ...data, event: 'Webhook received' });
    },
  },

  // Job processing logging
  jobs: {
    started: (data: { jobId: string; jobName: string; data: unknown }) => {
      logger.info({ ...data, event: 'Job started' });
    },

    completed: (data: { jobId: string; jobName: string; duration: number; result?: unknown }) => {
      logger.info({ ...data, event: 'Job completed' });
    },

    failed: (data: { jobId: string; jobName: string; error: unknown; attempts: number }) => {
      logger.error({ ...data, event: 'Job failed' });
    },

    retry: (data: { jobId: string; jobName: string; attempt: number; delay: number }) => {
      logger.warn({ ...data, event: 'Job retry scheduled' });
    },
  },

  // Database logging
  database: {
    query: (data: {
      operation: string;
      table?: string;
      duration?: number;
      businessId?: string;
    }) => {
      logger.debug({ ...data, event: 'Database operation' });
    },

    error: (data: { operation: string; table?: string; error: unknown; businessId?: string }) => {
      logger.error({ ...data, event: 'Database error' });
    },
  },

  // Security logging
  security: {
    authSuccess: (data: { userId: string; businessId: string; method: string; ip?: string }) => {
      logger.info({ ...data, event: 'Authentication success' });
    },

    authFailure: (data: { reason: string; ip?: string; userAgent?: string }) => {
      logger.warn({ ...data, event: 'Authentication failure' });
    },

    rateLimitExceeded: (data: { ip: string; businessId?: string; endpoint: string }) => {
      logger.warn({ ...data, event: 'Rate limit exceeded' });
    },

    suspiciousActivity: (data: {
      type: string;
      businessId?: string;
      ip?: string;
      details: unknown;
    }) => {
      logger.warn({ ...data, event: 'Suspicious activity detected' });
    },
  },
};

// Error logging utility
export function logError(error: unknown, context?: Record<string, unknown>) {
  const errorInfo = {
    error: {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    ...context,
  };

  logger.error({ ...errorInfo, event: 'Unhandled error' });
}

// Performance monitoring utility
export function createTimer(name: string, context?: Record<string, unknown>) {
  const startTime = process.hrtime.bigint();

  return {
    end: (additionalContext?: Record<string, unknown>) => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      logger.info({
        event: 'Performance metric',
        name,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
        ...context,
        ...additionalContext,
      });

      return duration;
    },
  };
}

export default logger;
