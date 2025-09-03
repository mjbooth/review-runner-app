import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';

const suppressionRoutes: FastifyPluginAsync = async function (fastify) {
  // List suppressions
  const listSuppressionsSchema = z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
    search: z.string().optional(),
    channel: z.enum(['SMS', 'EMAIL']).optional(),
    reason: z.string().optional(),
  });

  fastify.get('/', async (request, reply) => {
    try {
      const query = listSuppressionsSchema.parse(request.query);
      const { page, limit, search, channel, reason } = query;

      const offset = (page - 1) * limit;

      const where: any = {
        businessId: request.businessId!,
        isActive: true,
      };

      if (search) {
        where.contact = { contains: search, mode: 'insensitive' };
      }

      if (channel) where.channel = channel;
      if (reason) where.reason = reason;

      const [suppressions, totalCount] = await Promise.all([
        prisma.suppression.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            contact: true,
            channel: true,
            reason: true,
            source: true,
            notes: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.suppression.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      const meta: PaginationMeta = {
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage,
        },
      };

      const response: ApiSuccessResponse<typeof suppressions> = {
        success: true,
        data: suppressions,
        meta,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Add suppression
  const addSuppressionSchema = z.object({
    contact: z.string().min(1),
    channel: z.enum(['SMS', 'EMAIL']).optional(),
    reason: z.enum([
      'SMS_STOP',
      'EMAIL_UNSUBSCRIBE',
      'EMAIL_BOUNCE',
      'EMAIL_SPAM_COMPLAINT',
      'MANUAL',
      'GDPR_REQUEST',
    ]),
    notes: z.string().optional(),
    expiresAt: z
      .string()
      .transform(val => new Date(val))
      .optional(),
  });

  fastify.post('/', async (request, reply) => {
    try {
      const data = addSuppressionSchema.parse(request.body);

      const suppression = await prisma.suppression.create({
        data: {
          businessId: request.businessId!,
          contact: data.contact.toLowerCase().trim(),
          channel: data.channel || null,
          reason: data.reason,
          source: 'manual',
          notes: data.notes || null,
          expiresAt: data.expiresAt || null,
        },
        select: {
          id: true,
          contact: true,
          channel: true,
          reason: true,
          source: true,
          notes: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const response: ApiSuccessResponse<typeof suppression> = {
        success: true,
        data: suppression,
      };

      return reply.code(201).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Remove suppression
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const suppression = await prisma.suppression.updateMany({
        where: {
          id,
          businessId: request.businessId!,
          isActive: true,
        },
        data: { isActive: false },
      });

      if (suppression.count === 0) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'SUPPRESSION_NOT_FOUND', message: 'Suppression not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<{ message: string }> = {
        success: true,
        data: { message: 'Suppression removed successfully' },
      };

      return reply.send(response);
    } catch (error) {
      throw error;
    }
  });
};

export default suppressionRoutes;
