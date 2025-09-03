/**
 * Secure Review Request Routes Implementation
 *
 * Complete review request/campaign management API with comprehensive security:
 * - Message content validation and business rules
 * - Campaign frequency limits and credit management
 * - Channel-specific validation and cost controls
 * - Comprehensive audit logging and monitoring
 */

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';
import type { AuthenticatedRequest } from '../../types/auth';

// Security and validation imports
import {
  createReviewRequestSchema,
  updateReviewRequestSchema,
  reviewRequestQuerySchema,
  reviewRequestParamsSchema,
  createBulkReviewRequestsSchema,
  type CreateReviewRequestInput,
  type UpdateReviewRequestInput,
  type CreateBulkReviewRequestsInput,
} from '../../lib/validation-schemas';
import { createValidationMiddleware } from '../../lib/security-validation';
import { createRateLimitMiddleware, getRateLimiter } from '../../lib/business-rate-limiter';
import { createOwnershipMiddleware } from '../../lib/resource-ownership-validation';
import {
  createBusinessRulesMiddleware,
  getBusinessRulesValidator,
} from '../../lib/business-rules-validation';
import { requireAuth, requirePermissions, AuthUtils } from '../../lib/auth-helpers';

const secureReviewRequestRoutes: FastifyPluginAsync = async function (fastify) {
  // ==========================================
  // LIST REVIEW REQUESTS - With advanced filtering
  // ==========================================

  fastify.get(
    '/',
    {
      preHandler: [
        // Rate limiting: data reads
        createRateLimitMiddleware('data.read'),
        // Business rules validation
        createBusinessRulesMiddleware(['data_retention']),
        // Input validation
        createValidationMiddleware(reviewRequestQuerySchema, { source: 'query' }),
      ],
    },
    requirePermissions(['campaigns:read'])(async (request: AuthenticatedRequest, reply) => {
      const query = request.query as any;
      const {
        page,
        limit,
        search,
        tags,
        status,
        channel,
        customerId,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      } = query;
      const offset = (page - 1) * limit;

      try {
        logger.debug('Listing review requests with filters', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          filters: { status, channel, customerId, dateFrom, dateTo },
          pagination: { page, limit },
        });

        // Build secure query - RLS automatically filters by business
        const where: any = {};

        // Status filter
        if (status && status !== 'all') {
          where.status = status;
        }

        // Channel filter
        if (channel && channel !== 'all') {
          where.channel = channel;
        }

        // Customer filter
        if (customerId) {
          where.customerId = customerId;
        }

        // Date range filter
        if (dateFrom || dateTo) {
          where.createdAt = {};
          if (dateFrom) where.createdAt.gte = dateFrom;
          if (dateTo) where.createdAt.lte = dateTo;
        }

        // Search in message content (be careful with performance)
        if (search) {
          where.OR = [
            { messageContent: { contains: search, mode: 'insensitive' } },
            { subject: { contains: search, mode: 'insensitive' } },
          ];
        }

        // Build order by
        const orderBy: any = {};
        if (sortBy === 'scheduledFor') {
          orderBy.scheduledFor = sortOrder;
        } else if (sortBy === 'sentAt') {
          orderBy.sentAt = sortOrder;
        } else if (sortBy === 'status') {
          orderBy.status = sortOrder;
        } else {
          orderBy.createdAt = sortOrder;
        }

        // Execute queries
        const [reviewRequests, totalCount] = await Promise.all([
          prisma.reviewRequest.findMany({
            where,
            orderBy,
            skip: offset,
            take: limit,
            select: {
              id: true,
              customerId: true,
              channel: true,
              status: true,
              subject: true,
              messageContent: true,
              scheduledFor: true,
              sentAt: true,
              deliveredAt: true,
              clickedAt: true,
              completedAt: true,
              retryCount: true,
              createdAt: true,
              // Include customer info
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

        // Build pagination
        const totalPages = Math.ceil(totalCount / limit);
        const pagination: PaginationMeta = {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        };

        const response: ApiSuccessResponse<typeof reviewRequests> = {
          success: true,
          data: reviewRequests,
          meta: {
            pagination,
            filters: { status, channel, customerId, dateFrom, dateTo },
          },
        };

        logger.info('Review requests listed successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          resultCount: reviewRequests.length,
          totalCount,
        });

        return reply.send(response);
      } catch (error) {
        logger.error('Failed to list review requests', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
          filters: query,
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'REVIEW_REQUESTS_LIST_ERROR',
            message: 'Failed to retrieve review requests',
          },
        });
      }
    })
  );

  // ==========================================
  // CREATE REVIEW REQUEST - Full validation and cost control
  // ==========================================

  fastify.post(
    '/',
    {
      preHandler: [
        // Rate limiting: channel-specific
        createRateLimitMiddleware('data.write'), // Will be upgraded based on channel
        // Business rules validation
        createBusinessRulesMiddleware(['message_content', 'campaign_frequency', 'credit_limits']),
        // Input validation
        createValidationMiddleware(createReviewRequestSchema, { source: 'body', sanitize: true }),
      ],
    },
    requirePermissions(['campaigns:write'])(async (request: AuthenticatedRequest, reply) => {
      const data = request.body as CreateReviewRequestInput;
      const businessContext = (request as any).businessContext;
      const validator = (request as any).businessRulesValidator;

      try {
        logger.debug('Creating review request with validation', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: data.customerId,
          channel: data.channel,
          hasScheduling: !!data.scheduledFor,
        });

        // Apply channel-specific rate limiting
        const rateLimiter = getRateLimiter();
        const channelOperation = data.channel === 'SMS' ? 'sms.send' : 'email.send';

        const rateLimitCheck = await rateLimiter.checkRateLimit(
          request.businessId!,
          channelOperation as any,
          {
            tier: businessContext.tier,
            userId: request.clerkUserId,
            ip: request.ip,
          }
        );

        if (!rateLimitCheck.allowed) {
          logger.warn('Review request creation blocked by rate limit', {
            businessId: request.businessId,
            channel: data.channel,
            current: rateLimitCheck.current,
            limit: rateLimitCheck.limit,
          });

          return reply.status(429).send({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `${data.channel} rate limit exceeded`,
              retryAfter: rateLimitCheck.retryAfter,
              details: {
                current: rateLimitCheck.current,
                limit: rateLimitCheck.limit,
              },
            },
          });
        }

        // Check credits for the operation
        const creditCheck = await rateLimiter.checkBusinessCredits(
          request.businessId!,
          channelOperation as any
        );

        if (!creditCheck.hasCredits) {
          logger.warn('Review request creation blocked by insufficient credits', {
            businessId: request.businessId,
            channel: data.channel,
            required: creditCheck.requiredCredits,
            available: creditCheck.currentCredits,
          });

          return reply.status(402).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_CREDITS',
              message: `Insufficient ${creditCheck.creditType} credits`,
              details: {
                required: creditCheck.requiredCredits,
                available: creditCheck.currentCredits,
              },
            },
          });
        }

        // Validate customer exists and belongs to business
        const customer = await prisma.customer.findUnique({
          where: { id: data.customerId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
          },
        });

        if (!customer || !customer.isActive) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found or inactive',
            },
          });
        }

        // Validate customer has appropriate contact method
        if (data.channel === 'EMAIL' && !customer.email) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'MISSING_EMAIL',
              message: 'Customer must have email address for email campaigns',
            },
          });
        }

        if (data.channel === 'SMS' && !customer.phone) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'MISSING_PHONE',
              message: 'Customer must have phone number for SMS campaigns',
            },
          });
        }

        // Validate message content with business rules
        const messageValidation = await validator.validateMessageContent(
          data.messageContent,
          data.channel,
          businessContext,
          {
            customerId: data.customerId,
            scheduledFor: data.scheduledFor,
          }
        );

        if (!messageValidation.isValid) {
          logger.warn('Review request blocked by message validation', {
            businessId: request.businessId,
            channel: data.channel,
            errors: messageValidation.errors,
          });

          return reply.status(400).send({
            success: false,
            error: {
              code: 'MESSAGE_VALIDATION_FAILED',
              message: 'Message content validation failed',
              details: {
                errors: messageValidation.errors,
                warnings: messageValidation.warnings,
              },
            },
          });
        }

        // Validate campaign frequency
        const frequencyValidation = await validator.validateCampaignFrequency(
          data.customerId,
          data.channel,
          businessContext,
          data.scheduledFor
        );

        if (!frequencyValidation.isValid) {
          logger.warn('Review request blocked by frequency limits', {
            businessId: request.businessId,
            customerId: data.customerId,
            channel: data.channel,
            errors: frequencyValidation.errors,
          });

          return reply.status(429).send({
            success: false,
            error: {
              code: 'CAMPAIGN_FREQUENCY_EXCEEDED',
              message: 'Campaign frequency limits exceeded',
              details: {
                errors: frequencyValidation.errors,
                warnings: frequencyValidation.warnings,
              },
            },
          });
        }

        // Create review request with transaction
        const reviewRequest = await prisma.$transaction(async tx => {
          // Generate tracking UUID and URL
          const trackingUuid = crypto.randomUUID();
          const trackingUrl = `${process.env.APP_URL}/r/${trackingUuid}`;

          const newRequest = await tx.reviewRequest.create({
            data: {
              customerId: data.customerId,
              channel: data.channel,
              subject: data.subject,
              messageContent: messageValidation.sanitizedContent,
              reviewUrl: data.reviewUrl || businessContext.settings.defaultReviewUrl || '#',
              trackingUrl,
              trackingUuid,
              scheduledFor: data.scheduledFor,
              status: data.scheduledFor ? 'QUEUED' : 'QUEUED',
              metadata: {
                messageValidation: {
                  warnings: messageValidation.warnings,
                  metadata: messageValidation.metadata,
                },
                frequencyCheck: frequencyValidation.metadata,
                createdBy: request.clerkUserId,
                ipAddress: request.ip,
              },
              business: {
                connect: { id: request.businessId! },
              },
            },
            select: {
              id: true,
              customerId: true,
              channel: true,
              status: true,
              subject: true,
              messageContent: true,
              trackingUuid: true,
              scheduledFor: true,
              createdAt: true,
            },
          });

          // Consume credits
          await rateLimiter.consumeCredits(request.businessId!, channelOperation as any);

          // Create audit event
          await tx.event.create({
            data: {
              businessId: request.businessId!,
              reviewRequestId: newRequest.id,
              type: 'REQUEST_CREATED',
              source: 'api',
              description: `${data.channel} review request created for ${customer.firstName}`,
              metadata: {
                reviewRequestId: newRequest.id,
                customerId: data.customerId,
                channel: data.channel,
                createdBy: request.clerkUserId,
                messageLength: data.messageContent.length,
                hasScheduling: !!data.scheduledFor,
                warnings: messageValidation.warnings,
              },
            },
          });

          return newRequest;
        });

        const response: ApiSuccessResponse<typeof reviewRequest> = {
          success: true,
          data: reviewRequest,
          meta: {
            warnings: [...messageValidation.warnings, ...frequencyValidation.warnings],
            creditsUsed: creditCheck.requiredCredits,
            creditsRemaining: creditCheck.currentCredits - creditCheck.requiredCredits,
          },
        };

        logger.info('Review request created successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          reviewRequestId: reviewRequest.id,
          channel: reviewRequest.channel,
          customerId: reviewRequest.customerId,
          scheduled: !!reviewRequest.scheduledFor,
        });

        return reply.status(201).send(response);
      } catch (error) {
        logger.error('Failed to create review request', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
          data: {
            customerId: data.customerId,
            channel: data.channel,
            hasScheduling: !!data.scheduledFor,
          },
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'REVIEW_REQUEST_CREATION_ERROR',
            message: 'Failed to create review request',
          },
        });
      }
    })
  );

  // ==========================================
  // GET SINGLE REVIEW REQUEST - With ownership validation
  // ==========================================

  fastify.get(
    '/:id',
    {
      preHandler: [
        createRateLimitMiddleware('data.read'),
        createOwnershipMiddleware('review_request', {
          resourceIdParam: 'id',
          operation: 'read',
        }),
        createValidationMiddleware(reviewRequestParamsSchema, { source: 'params' }),
      ],
    },
    requirePermissions(['campaigns:read'])(async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as any;

      try {
        const reviewRequest = await prisma.reviewRequest.findUnique({
          where: { id },
          select: {
            id: true,
            customerId: true,
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
            isActive: true,
            createdAt: true,
            updatedAt: true,
            // Include customer info
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            // Include related events
            events: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                type: true,
                source: true,
                description: true,
                createdAt: true,
              },
            },
          },
        });

        if (!reviewRequest) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'REVIEW_REQUEST_NOT_FOUND',
              message: 'Review request not found',
            },
          });
        }

        const response: ApiSuccessResponse<typeof reviewRequest> = {
          success: true,
          data: reviewRequest,
        };

        return reply.send(response);
      } catch (error) {
        logger.error('Failed to get review request', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          reviewRequestId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'REVIEW_REQUEST_FETCH_ERROR',
            message: 'Failed to retrieve review request',
          },
        });
      }
    })
  );

  // ==========================================
  // UPDATE REVIEW REQUEST - Limited updates allowed
  // ==========================================

  fastify.put(
    '/:id',
    {
      preHandler: [
        createRateLimitMiddleware('data.write'),
        createOwnershipMiddleware('review_request', {
          resourceIdParam: 'id',
          operation: 'write',
        }),
        createValidationMiddleware(updateReviewRequestSchema, { source: 'body', sanitize: true }),
        createValidationMiddleware(reviewRequestParamsSchema, { source: 'params' }),
      ],
    },
    requirePermissions(['campaigns:write'])(async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as any;
      const data = request.body as UpdateReviewRequestInput;

      try {
        // Get current review request to check what can be updated
        const currentRequest = await prisma.reviewRequest.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            scheduledFor: true,
            sentAt: true,
            customerId: true,
            channel: true,
          },
        });

        if (!currentRequest) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'REVIEW_REQUEST_NOT_FOUND',
              message: 'Review request not found',
            },
          });
        }

        // Validate what can be updated based on current status
        const allowedUpdates: (keyof UpdateReviewRequestInput)[] = [];

        if (currentRequest.status === 'QUEUED' && !currentRequest.sentAt) {
          // Can update scheduling for queued requests
          allowedUpdates.push('scheduledFor', 'notes');
        }

        if (['QUEUED', 'SENT', 'DELIVERED'].includes(currentRequest.status)) {
          // Can add notes and update status for active requests
          allowedUpdates.push('notes');
        }

        // Admin can update status manually
        if (AuthUtils.isBusinessAdmin(request)) {
          allowedUpdates.push('status');
        }

        // Check if requested updates are allowed
        const requestedUpdates = Object.keys(data) as (keyof UpdateReviewRequestInput)[];
        const unauthorizedUpdates = requestedUpdates.filter(key => !allowedUpdates.includes(key));

        if (unauthorizedUpdates.length > 0) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_UPDATE_REQUEST',
              message: `Cannot update ${unauthorizedUpdates.join(', ')} for request in ${currentRequest.status} status`,
              details: {
                allowedUpdates,
                requestedUpdates,
                currentStatus: currentRequest.status,
              },
            },
          });
        }

        // Update review request with audit
        const updatedRequest = await prisma.$transaction(async tx => {
          const updated = await tx.reviewRequest.update({
            where: { id },
            data: {
              ...data,
              updatedAt: new Date(),
            },
            select: {
              id: true,
              status: true,
              scheduledFor: true,
              notes: true,
              updatedAt: true,
            },
          });

          // Create audit event
          await tx.event.create({
            data: {
              businessId: request.businessId!,
              reviewRequestId: id,
              type: 'REQUEST_CREATED', // Could add REQUEST_UPDATED
              source: 'api',
              description: `Review request updated by ${request.clerkUserId}`,
              metadata: {
                updatedBy: request.clerkUserId,
                previousStatus: currentRequest.status,
                updates: data,
                ipAddress: request.ip,
              },
            },
          });

          return updated;
        });

        const response: ApiSuccessResponse<typeof updatedRequest> = {
          success: true,
          data: updatedRequest,
        };

        logger.info('Review request updated successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          reviewRequestId: id,
          updates: Object.keys(data),
        });

        return reply.send(response);
      } catch (error) {
        if ((error as any)?.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'REVIEW_REQUEST_NOT_FOUND',
              message: 'Review request not found',
            },
          });
        }

        logger.error('Failed to update review request', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          reviewRequestId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'REVIEW_REQUEST_UPDATE_ERROR',
            message: 'Failed to update review request',
          },
        });
      }
    })
  );

  // ==========================================
  // BULK CREATE REVIEW REQUESTS - High security
  // ==========================================

  fastify.post(
    '/bulk',
    {
      preHandler: [
        createRateLimitMiddleware('bulk.create', {
          quantity: request => {
            const data = request.body as any;
            return data?.customerIds?.length || 1;
          },
        }),
        createBusinessRulesMiddleware([
          'bulk_operation_limits',
          'message_content',
          'credit_limits',
        ]),
        createValidationMiddleware(createBulkReviewRequestsSchema, {
          source: 'body',
          sanitize: true,
        }),
      ],
    },
    requireAuth({
      level: 'admin', // Bulk operations require admin
    })(async (request: AuthenticatedRequest, reply) => {
      const data = request.body as CreateBulkReviewRequestsInput;
      const businessContext = (request as any).businessContext;
      const validator = (request as any).businessRulesValidator;

      try {
        logger.info('Bulk review request creation started', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerCount: data.customerIds.length,
          channel: data.channel,
        });

        // Validate bulk operation limits
        const bulkValidation = await validator.validateBulkOperationLimits(
          'bulk_campaign',
          data.customerIds.length,
          businessContext
        );

        if (!bulkValidation.isValid) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'BULK_OPERATION_LIMIT_EXCEEDED',
              message: 'Bulk campaign limits exceeded',
              details: {
                errors: bulkValidation.errors,
                warnings: bulkValidation.warnings,
              },
            },
          });
        }

        // Check total credits needed
        const rateLimiter = getRateLimiter();
        const channelOperation = data.channel === 'SMS' ? 'sms.send' : 'email.send';

        const creditCheck = await rateLimiter.checkBusinessCredits(
          request.businessId!,
          channelOperation as any,
          data.customerIds.length
        );

        if (!creditCheck.hasCredits) {
          return reply.status(402).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_CREDITS_BULK',
              message: `Insufficient ${creditCheck.creditType} credits for bulk operation`,
              details: {
                required: creditCheck.requiredCredits,
                available: creditCheck.currentCredits,
                customerCount: data.customerIds.length,
              },
            },
          });
        }

        // Validate message content
        const messageValidation = await validator.validateMessageContent(
          data.messageContent,
          data.channel,
          businessContext,
          {
            scheduledFor: data.scheduledFor,
          }
        );

        if (!messageValidation.isValid) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'MESSAGE_VALIDATION_FAILED',
              message: 'Message content validation failed',
              details: {
                errors: messageValidation.errors,
                warnings: messageValidation.warnings,
              },
            },
          });
        }

        // Validate all customers exist and have appropriate contact methods
        const customers = await prisma.customer.findMany({
          where: {
            id: { in: data.customerIds },
            isActive: true,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        });

        const validCustomers = customers.filter(customer => {
          if (data.channel === 'EMAIL') return !!customer.email;
          if (data.channel === 'SMS') return !!customer.phone;
          return false;
        });

        if (validCustomers.length === 0) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'NO_VALID_CUSTOMERS',
              message: `No customers found with required ${data.channel.toLowerCase()} contact information`,
              details: {
                requestedCount: data.customerIds.length,
                foundCount: customers.length,
                validCount: validCustomers.length,
              },
            },
          });
        }

        // Create bulk review requests
        const result = await prisma.$transaction(async tx => {
          const created = [];
          const skipped = [];

          for (const customer of validCustomers) {
            try {
              // Check individual campaign frequency
              const frequencyCheck = await validator.validateCampaignFrequency(
                customer.id,
                data.channel,
                businessContext,
                data.scheduledFor
              );

              if (!frequencyCheck.isValid) {
                skipped.push({
                  customerId: customer.id,
                  customerName: `${customer.firstName} ${customer.lastName}`,
                  reason: 'Campaign frequency limit exceeded',
                  details: frequencyCheck.errors,
                });
                continue;
              }

              // Create review request
              const trackingUuid = crypto.randomUUID();
              const trackingUrl = `${process.env.APP_URL}/r/${trackingUuid}`;

              const reviewRequest = await tx.reviewRequest.create({
                data: {
                  customerId: customer.id,
                  channel: data.channel,
                  subject: data.subject,
                  messageContent: messageValidation.sanitizedContent,
                  reviewUrl: data.reviewUrl || '#',
                  trackingUrl,
                  trackingUuid,
                  scheduledFor: data.scheduledFor,
                  status: 'QUEUED',
                  metadata: {
                    bulkCampaignId: crypto.randomUUID(),
                    messageValidation: messageValidation.metadata,
                    createdBy: request.clerkUserId,
                    ipAddress: request.ip,
                  },
                  business: {
                    connect: { id: request.businessId! },
                  },
                },
                select: {
                  id: true,
                  customerId: true,
                  channel: true,
                  status: true,
                  trackingUuid: true,
                },
              });

              created.push(reviewRequest);
            } catch (error) {
              skipped.push({
                customerId: customer.id,
                customerName: `${customer.firstName} ${customer.lastName}`,
                reason: 'Database error during creation',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Consume credits for successful creations
          if (created.length > 0) {
            await rateLimiter.consumeCredits(
              request.businessId!,
              channelOperation as any,
              created.length
            );
          }

          // Create audit event
          await tx.event.create({
            data: {
              businessId: request.businessId!,
              type: 'REQUEST_CREATED', // Could add BULK_CAMPAIGN_CREATED
              source: 'api',
              description: `Bulk ${data.channel} campaign created by ${request.clerkUserId}`,
              metadata: {
                createdBy: request.clerkUserId,
                channel: data.channel,
                totalAttempted: data.customerIds.length,
                created: created.length,
                skipped: skipped.length,
                creditsConsumed: created.length * creditCheck.requiredCredits,
                hasScheduling: !!data.scheduledFor,
              },
            },
          });

          return { created, skipped };
        });

        const response: ApiSuccessResponse<typeof result.created> = {
          success: true,
          data: result.created,
          meta: {
            summary: {
              attempted: data.customerIds.length,
              created: result.created.length,
              skipped: result.skipped.length,
              creditsUsed: result.created.length * creditCheck.requiredCredits,
            },
            skipped: result.skipped,
            warnings: [...messageValidation.warnings, ...bulkValidation.warnings],
          },
        };

        logger.info('Bulk review request creation completed', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          created: result.created.length,
          skipped: result.skipped.length,
          channel: data.channel,
        });

        return reply.status(201).send(response);
      } catch (error) {
        logger.error('Bulk review request creation failed', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerCount: data.customerIds.length,
          channel: data.channel,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'BULK_CAMPAIGN_ERROR',
            message: 'Bulk campaign creation failed',
          },
        });
      }
    })
  );
};

export default secureReviewRequestRoutes;
