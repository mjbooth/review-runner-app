/**
 * Complete Example: Customer Routes with Full Authentication Integration
 *
 * This file demonstrates how to use the complete authentication system:
 * - Clerk JWT validation
 * - Business context integration with RLS
 * - Route protection decorators
 * - Permission-based access control
 * - Security logging and monitoring
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';
import type { AuthenticatedRequest } from '../../types/auth';
import {
  requireAuth,
  requireAdmin,
  requirePermissions,
  requireBusinessOwner,
  optionalAuth,
  AuthUtils,
  createAuthSchema,
} from '../../lib/auth-helpers';

/**
 * Customer routes with comprehensive authentication
 */
const customerRoutes: FastifyPluginAsync = async function (fastify) {
  // Validation schemas
  const listCustomersSchema = z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
    search: z.string().optional(),
    tags: z.string().optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
  });

  const createCustomerSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    tags: z.array(z.string()).default([]),
  });

  const updateCustomerSchema = createCustomerSchema.partial();

  const customerParamsSchema = z.object({
    id: z.string().uuid(),
  });

  // ==========================================
  // LIST CUSTOMERS - Requires 'customers:read' permission
  // ==========================================

  fastify.get(
    '/',
    {
      schema: {
        ...createAuthSchema({ level: 'required', permissions: ['customers:read'] }),
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string', default: '1' },
            limit: { type: 'string', default: '20' },
            search: { type: 'string' },
            tags: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'all'], default: 'active' },
          },
        },
      },
    },
    requirePermissions(['customers:read'])(async (request: AuthenticatedRequest, reply) => {
      const query = listCustomersSchema.parse(request.query);
      const { page, limit, search, tags, status } = query;
      const offset = (page - 1) * limit;

      logger.debug('Listing customers', {
        businessId: request.businessId,
        userId: request.clerkUserId,
        filters: { search, tags, status },
        pagination: { page, limit },
      });

      try {
        // Build where clause - RLS automatically filters by business
        const where: any = {};

        // Status filter
        if (status !== 'all') {
          where.isActive = status === 'active';
        }

        // Search filter
        if (search) {
          where.OR = [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ];
        }

        // Tags filter
        if (tags) {
          const tagArray = tags.split(',').map(tag => tag.trim());
          where.tags = { hasSome: tagArray };
        }

        // Execute queries - RLS automatically filters by businessId
        const [customers, totalCount] = await Promise.all([
          prisma.customer.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              tags: true,
              lastContact: true,
              isActive: true,
              createdAt: true,
              _count: {
                select: { reviewRequests: true },
              },
            },
          }),
          prisma.customer.count({ where }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const pagination: PaginationMeta = {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        };

        const response: ApiSuccessResponse<typeof customers> = {
          success: true,
          data: customers,
          meta: { pagination },
        };

        logger.info('Customers listed successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          count: customers.length,
          totalCount,
        });

        return reply.send(response);
      } catch (error) {
        logger.error('Failed to list customers', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CUSTOMERS_LIST_ERROR',
            message: 'Failed to retrieve customers',
          },
        };
        return reply.status(500).send(errorResponse);
      }
    })
  );

  // ==========================================
  // CREATE CUSTOMER - Requires 'customers:write' permission
  // ==========================================

  fastify.post(
    '/',
    {
      schema: createAuthSchema({ level: 'required', permissions: ['customers:write'] }),
    },
    requirePermissions(['customers:write'])(async (request: AuthenticatedRequest, reply) => {
      const data = createCustomerSchema.parse(request.body);

      // Validate at least one contact method
      if (!data.email && !data.phone) {
        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Customer must have at least email or phone',
          },
        };
        return reply.status(400).send(errorResponse);
      }

      logger.debug('Creating customer', {
        businessId: request.businessId,
        userId: request.clerkUserId,
        customerData: { firstName: data.firstName, email: data.email, phone: data.phone },
      });

      try {
        // Create customer - RLS ensures correct businessId is set
        const customer = await prisma.customer.create({
          data: {
            ...data,
            business: {
              connect: { id: request.businessId! },
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            tags: true,
            createdAt: true,
          },
        });

        // Log customer creation event
        await prisma.event.create({
          data: {
            businessId: request.businessId!,
            type: 'REQUEST_CREATED', // You might want to add CUSTOMER_CREATED to your enum
            source: 'system',
            description: `Customer ${customer.firstName} created by ${request.clerkUserId}`,
            metadata: {
              customerId: customer.id,
              createdBy: request.clerkUserId,
            },
          },
        });

        const response: ApiSuccessResponse<typeof customer> = {
          success: true,
          data: customer,
        };

        logger.info('Customer created successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: customer.id,
        });

        return reply.status(201).send(response);
      } catch (error) {
        logger.error('Failed to create customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CUSTOMER_CREATION_ERROR',
            message: 'Failed to create customer',
          },
        };
        return reply.status(500).send(errorResponse);
      }
    })
  );

  // ==========================================
  // GET SINGLE CUSTOMER - Requires 'customers:read' permission
  // ==========================================

  fastify.get(
    '/:id',
    {
      schema: createAuthSchema({ level: 'required', permissions: ['customers:read'] }),
    },
    requirePermissions(['customers:read'])(async (request: AuthenticatedRequest, reply) => {
      const { id } = customerParamsSchema.parse(request.params);

      try {
        // Find customer - RLS automatically filters by business
        const customer = await prisma.customer.findUnique({
          where: { id },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            notes: true,
            tags: true,
            lastContact: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                reviewRequests: {
                  where: { isActive: true },
                },
              },
            },
            reviewRequests: {
              where: { isActive: true },
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                channel: true,
                createdAt: true,
                sentAt: true,
                clickedAt: true,
              },
            },
          },
        });

        if (!customer) {
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          };
          return reply.status(404).send(errorResponse);
        }

        const response: ApiSuccessResponse<typeof customer> = {
          success: true,
          data: customer,
        };

        return reply.send(response);
      } catch (error) {
        logger.error('Failed to get customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CUSTOMER_FETCH_ERROR',
            message: 'Failed to retrieve customer',
          },
        };
        return reply.status(500).send(errorResponse);
      }
    })
  );

  // ==========================================
  // UPDATE CUSTOMER - Requires 'customers:write' permission
  // ==========================================

  fastify.put(
    '/:id',
    {
      schema: createAuthSchema({ level: 'required', permissions: ['customers:write'] }),
    },
    requirePermissions(['customers:write'])(async (request: AuthenticatedRequest, reply) => {
      const { id } = customerParamsSchema.parse(request.params);
      const data = updateCustomerSchema.parse(request.body);

      try {
        // Update customer - RLS ensures only business-owned customers are updated
        const customer = await prisma.customer.update({
          where: { id },
          data: {
            ...data,
            updatedAt: new Date(),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            notes: true,
            tags: true,
            updatedAt: true,
          },
        });

        const response: ApiSuccessResponse<typeof customer> = {
          success: true,
          data: customer,
        };

        logger.info('Customer updated successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: customer.id,
        });

        return reply.send(response);
      } catch (error) {
        if ((error as any)?.code === 'P2025') {
          // Prisma "Record not found" error
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          };
          return reply.status(404).send(errorResponse);
        }

        logger.error('Failed to update customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CUSTOMER_UPDATE_ERROR',
            message: 'Failed to update customer',
          },
        };
        return reply.status(500).send(errorResponse);
      }
    })
  );

  // ==========================================
  // DELETE CUSTOMER - Requires business owner or 'customers:delete' permission
  // ==========================================

  fastify.delete(
    '/:id',
    {
      schema: createAuthSchema({ level: 'admin', permissions: ['customers:delete'] }),
    },
    requireAuth({
      level: 'required',
      validator: async authContext => {
        // Only business owners or users with explicit delete permission can delete
        return (
          authContext.business.role === 'owner' ||
          authContext.business.permissions?.includes('customers:delete') ||
          false
        );
      },
    })(async (request: AuthenticatedRequest, reply) => {
      const { id } = customerParamsSchema.parse(request.params);

      try {
        // Soft delete customer - RLS ensures only business-owned customers are affected
        await prisma.customer.update({
          where: { id },
          data: {
            isActive: false,
            updatedAt: new Date(),
          },
        });

        const response: ApiSuccessResponse<{}> = {
          success: true,
          data: {},
        };

        logger.info('Customer deleted successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          role: request.auth?.business.role,
        });

        return reply.send(response);
      } catch (error) {
        if ((error as any)?.code === 'P2025') {
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          };
          return reply.status(404).send(errorResponse);
        }

        logger.error('Failed to delete customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CUSTOMER_DELETE_ERROR',
            message: 'Failed to delete customer',
          },
        };
        return reply.status(500).send(errorResponse);
      }
    })
  );

  // ==========================================
  // BULK IMPORT - Business Owner Only
  // ==========================================

  const importCustomersSchema = z.object({
    customers: z.array(createCustomerSchema).min(1).max(1000),
    skipDuplicates: z.boolean().default(true),
  });

  fastify.post(
    '/import',
    {
      schema: createAuthSchema({ level: 'admin' }),
    },
    requireBusinessOwner(async (request: AuthenticatedRequest, reply) => {
      const { customers, skipDuplicates } = importCustomersSchema.parse(request.body);

      logger.info('Starting customer bulk import', {
        businessId: request.businessId,
        userId: request.clerkUserId,
        count: customers.length,
        skipDuplicates,
      });

      try {
        // Validate customers
        const validCustomers = customers.filter(customer => customer.email || customer.phone);

        if (validCustomers.length === 0) {
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'No valid customers found - each customer must have email or phone',
            },
          };
          return reply.status(400).send(errorResponse);
        }

        // Use transaction for bulk insert
        const result = await prisma.$transaction(
          validCustomers.map(customerData =>
            prisma.customer.create({
              data: {
                ...customerData,
                business: {
                  connect: { id: request.businessId! },
                },
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            })
          )
        );

        const response: ApiSuccessResponse<typeof result> = {
          success: true,
          data: result,
          meta: {
            imported: result.length,
            skipped: customers.length - result.length,
          },
        };

        logger.info('Customer bulk import completed', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          imported: result.length,
          skipped: customers.length - result.length,
        });

        return reply.status(201).send(response);
      } catch (error) {
        logger.error('Customer bulk import failed', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          count: customers.length,
          error: error instanceof Error ? error.message : String(error),
        });

        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'IMPORT_ERROR',
            message: 'Failed to import customers',
          },
        };
        return reply.status(500).send(errorResponse);
      }
    })
  );

  // ==========================================
  // CUSTOMER ANALYTICS - Optional Authentication
  // Shows different data based on auth status
  // ==========================================

  fastify.get(
    '/analytics',
    {
      schema: {
        ...createAuthSchema({ level: 'optional' }),
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  totalCustomers: { type: 'number' },
                  activeCustomers: { type: 'number' },
                  // More properties would be here
                },
              },
            },
          },
        },
      },
    },
    optionalAuth(async (request: AuthenticatedRequest, reply) => {
      try {
        if (AuthUtils.isAuthenticated(request)) {
          // Authenticated user - show detailed analytics
          const [totalCustomers, activeCustomers, recentCustomers] = await Promise.all([
            prisma.customer.count(),
            prisma.customer.count({ where: { isActive: true } }),
            prisma.customer.count({
              where: {
                isActive: true,
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            }),
          ]);

          return reply.send({
            success: true,
            data: {
              totalCustomers,
              activeCustomers,
              inactiveCustomers: totalCustomers - activeCustomers,
              recentCustomers,
              businessId: request.businessId, // Only show for authenticated users
            },
          });
        } else {
          // Public analytics - limited data
          return reply.send({
            success: true,
            data: {
              message: 'Public analytics available. Sign in for detailed insights.',
              featuresAvailable: ['customer management', 'review campaigns', 'analytics'],
            },
          });
        }
      } catch (error) {
        logger.error('Failed to get customer analytics', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          isAuthenticated: AuthUtils.isAuthenticated(request),
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'ANALYTICS_ERROR',
            message: 'Failed to retrieve analytics',
          },
        });
      }
    })
  );
};

export default customerRoutes;
