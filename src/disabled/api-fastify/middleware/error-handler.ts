import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger, logError } from '../../lib/logger';
import type { ApiErrorResponse } from '../../types/api';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const requestId = request.id;
  const businessId = request.businessId;

  // Log error with context
  logError(error, {
    requestId,
    businessId,
    method: request.method,
    url: request.url,
  });

  // Handle specific error types
  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authorization token has expired',
      },
    };
    return reply.code(401).send(response);
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authorization token',
      },
    };
    return reply.code(401).send(response);
  }

  if (error.code === 'FST_ERR_VALIDATION') {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      },
    };
    return reply.code(400).send(response);
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    // Handle Prisma-specific errors
    const prismaError = error as any;

    if (prismaError.code === 'P2002') {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'A record with this information already exists',
          details: prismaError.meta,
        },
      };
      return reply.code(409).send(response);
    }

    if (prismaError.code === 'P2025') {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'RECORD_NOT_FOUND',
          message: 'The requested record was not found',
        },
      };
      return reply.code(404).send(response);
    }
  }

  if (error.code === 'FST_ERR_CTP_TOO_MANY_REQUESTS') {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    };
    return reply.code(429).send(response);
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'An internal server error occurred' : error.message,
      ...(process.env.NODE_ENV === 'development' && {
        details: {
          stack: error.stack,
          requestId,
        },
      }),
    },
  };

  return reply.code(statusCode).send(response);
}
