import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';
import type { RequestChannel } from '@prisma/client';
import { createReviewRequest, createBulkReviewRequests } from '../../services/review-requests';

const reviewRequestRoutes: FastifyPluginAsync = async function (fastify) {
  // List review requests with pagination and filters
  const listRequestsSchema = z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
    status: z.string().optional(),
    channel: z.enum(['SMS', 'EMAIL']).optional(),
    customerId: z.string().optional(),
    from: z.string().optional(), // ISO date string
    to: z.string().optional(), // ISO date string
  });

  fastify.get('/', async (request, reply) => {
    try {
      const query = listRequestsSchema.parse(request.query);
      const { page, limit, status, channel, customerId, from, to } = query;

      const offset = (page - 1) * limit;

      const where: any = {
        businessId: request.businessId!,
        isActive: true,
      };

      if (status) where.status = status;
      if (channel) where.channel = channel;
      if (customerId) where.customerId = customerId;

      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }

      const [requests, totalCount] = await Promise.all([
        prisma.reviewRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            channel: true,
            status: true,
            subject: true,
            reviewUrl: true,
            trackingUuid: true,
            scheduledFor: true,
            sentAt: true,
            deliveredAt: true,
            clickedAt: true,
            completedAt: true,
            followupSentAt: true,
            errorMessage: true,
            retryCount: true,
            createdAt: true,
            updatedAt: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        }),
        prisma.reviewRequest.count({ where }),
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

      const response: ApiSuccessResponse<typeof requests> = {
        success: true,
        data: requests,
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

  // Create single review request
  const createRequestSchema = z.object({
    customerId: z.string().uuid(),
    channel: z.enum(['SMS', 'EMAIL']),
    subject: z.string().optional(), // Required for email
    messageContent: z.string().min(1),
    reviewUrl: z.string().url(),
    scheduledFor: z
      .string()
      .transform(val => new Date(val))
      .optional(),
  });

  fastify.post('/', async (request, reply) => {
    try {
      const data = createRequestSchema.parse(request.body);

      // Temporarily simplified version - create review request directly
      console.warn('Creating review request with data:', data);

      // Verify customer exists and belongs to business
      const customer = await prisma.customer.findFirst({
        where: {
          id: data.customerId,
          businessId: request.businessId!,
          isActive: true,
        },
      });

      if (!customer) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: 'Customer not found or inactive',
          },
        };
        return reply.code(400).send(response);
      }

      // Validate contact method for channel
      if (data.channel === 'EMAIL' && !customer.email) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_CONTACT',
            message: 'Customer does not have an email address',
          },
        };
        return reply.code(400).send(response);
      }

      if (data.channel === 'SMS' && !customer.phone) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_CONTACT',
            message: 'Customer does not have a phone number',
          },
        };
        return reply.code(400).send(response);
      }

      // Email requires subject
      if (data.channel === 'EMAIL' && !data.subject) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Subject is required for email requests',
          },
        };
        return reply.code(400).send(response);
      }

      // Generate tracking UUID and URL
      const trackingUuid = require('uuid').v4();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const trackingUrl = `${baseUrl}/r/${trackingUuid}`;

      // Create review request in database
      const reviewRequest = await prisma.reviewRequest.create({
        data: {
          businessId: request.businessId!,
          customerId: data.customerId,
          channel: data.channel,
          subject: data.subject || null,
          messageContent: data.messageContent,
          reviewUrl: data.reviewUrl,
          trackingUuid,
          trackingUrl,
          scheduledFor: data.scheduledFor || new Date(),
          status: 'QUEUED',
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      console.warn('Review request created:', reviewRequest.id);

      // Add job to queue for processing
      try {
        const { addJobToQueue } = await import('../../services/job-queue');
        await addJobToQueue('send-request', {
          requestId: reviewRequest.id,
          retryCount: 0,
        });
        console.warn('Review request job queued successfully');
      } catch (queueError) {
        console.error('Failed to queue review request job:', queueError);
        // Don't fail the request creation if queuing fails
      }

      const response: ApiSuccessResponse<typeof reviewRequest> = {
        success: true,
        data: reviewRequest,
      };

      return reply.code(201).send(response);
    } catch (error) {
      console.error('Error creating review request:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        businessId: request.businessId,
      });

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

      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'REQUEST_CREATION_FAILED',
          message: 'Failed to create review request',
          details: error instanceof Error ? error.message : String(error),
        },
      };

      return reply.code(500).send(response);
    }
  });

  // Create bulk review requests
  const createBulkRequestSchema = z.object({
    customerIds: z.array(z.string().uuid()).min(1).max(100), // Limit to 100 customers at once
    channel: z.enum(['SMS', 'EMAIL']),
    subject: z.string().optional(), // Required for email
    messageContent: z.string().min(1),
    reviewUrl: z.string().url(),
    scheduledFor: z
      .string()
      .transform(val => new Date(val))
      .optional(),
  });

  fastify.post('/bulk', async (request, reply) => {
    try {
      const data = createBulkRequestSchema.parse(request.body);

      // Use the service to create bulk review requests
      const requestParams: any = {
        businessId: request.businessId!,
        customerIds: data.customerIds,
        channel: data.channel as RequestChannel,
        messageContent: data.messageContent,
        reviewUrl: data.reviewUrl,
      };
      
      if (data.subject) requestParams.subject = data.subject;
      if (data.scheduledFor) requestParams.scheduledFor = data.scheduledFor;
      
      const result = await createBulkReviewRequests(requestParams);

      if (!result.success) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'BULK_REQUEST_CREATION_FAILED',
            message: result.error,
          },
        };
        return reply.code(400).send(response);
      }

      const response: ApiSuccessResponse<typeof result.data> = {
        success: true,
        data: result.data,
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

  // Get review request by ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const reviewRequest = await prisma.reviewRequest.findFirst({
        where: {
          id,
          businessId: request.businessId!,
          isActive: true,
        },
        select: {
          id: true,
          channel: true,
          status: true,
          subject: true,
          messageContent: true,
          reviewUrl: true,
          trackingUrl: true,
          trackingUuid: true,
          scheduledFor: true,
          sentAt: true,
          deliveredAt: true,
          clickedAt: true,
          completedAt: true,
          followupSentAt: true,
          externalId: true,
          errorMessage: true,
          retryCount: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          events: {
            select: {
              id: true,
              type: true,
              source: true,
              description: true,
              metadata: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!reviewRequest) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'REQUEST_NOT_FOUND', message: 'Review request not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<typeof reviewRequest> = {
        success: true,
        data: reviewRequest,
      };

      return reply.send(response);
    } catch (error) {
      throw error;
    }
  });
};

export default reviewRequestRoutes;
