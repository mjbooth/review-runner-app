/**
 * Example: Customer Routes with Row Level Security (RLS)
 *
 * This file demonstrates how to update existing API routes to use
 * Row Level Security policies with business context management.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';
import {
  businessContextMiddleware,
  executeInBusinessContext,
  withBusinessContextRoute,
  BusinessContextRequest,
} from '../middleware/business-context';

const customerRoutes: FastifyPluginAsync = async function (fastify) {
  // Register business context middleware for all routes in this plugin
  fastify.addHook('preHandler', businessContextMiddleware);

  // List customers with pagination (RLS automatically filters by business)
  const listCustomersSchema = z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
    search: z.string().optional(),
    tags: z.string().optional(), // Comma-separated tags
  });

  fastify.get(
    '/',
    withBusinessContextRoute(async (request: BusinessContextRequest, reply) => {
      const query = listCustomersSchema.parse(request.query);
      const { page, limit, search, tags } = query;

      const offset = (page - 1) * limit;

      const result = await executeInBusinessContext(request, async () => {
        // Build where clause - NO NEED to include businessId!
        // RLS policies automatically filter by business context
        const where: any = {
          isActive: true,
        };

        if (search) {
          where.OR = [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ];
        }

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
              createdAt: true,
              // Note: businessId is automatically filtered by RLS
              // We can still select it if needed for API response
              businessId: true,
            },
          }),
          prisma.customer.count({ where }),
        ]);

        return { customers, totalCount };
      });

      const totalPages = Math.ceil(result.totalCount / limit);
      const pagination: PaginationMeta = {
        page,
        limit,
        totalCount: result.totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      const response: ApiSuccessResponse<typeof result.customers> = {
        success: true,
        data: result.customers,
        meta: { pagination },
      };

      return reply.send(response);
    })
  );

  // Create customer (RLS ensures it's created with correct businessId)
  const createCustomerSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    tags: z.array(z.string()).default([]),
  });

  fastify.post(
    '/',
    withBusinessContextRoute(async (request: BusinessContextRequest, reply) => {
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

      const customer = await executeInBusinessContext(request, async () => {
        // Create customer - RLS INSERT policy ensures businessId is set correctly
        // from the session context, so we don't need to explicitly set it!
        return prisma.customer.create({
          data: {
            ...data,
            // businessId is automatically set by the RLS context
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
      });

      const response: ApiSuccessResponse<typeof customer> = {
        success: true,
        data: customer,
      };

      return reply.status(201).send(response);
    })
  );

  // Get single customer by ID (RLS automatically ensures business access)
  const getCustomerParamsSchema = z.object({
    id: z.string().uuid(),
  });

  fastify.get(
    '/:id',
    withBusinessContextRoute(async (request: BusinessContextRequest, reply) => {
      const { id } = getCustomerParamsSchema.parse(request.params);

      const customer = await executeInBusinessContext(request, async () => {
        // Find customer - RLS automatically filters by business context
        // If customer doesn't belong to current business, it won't be found
        return prisma.customer.findUnique({
          where: {
            id,
            // No need for businessId check - RLS handles this!
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
            lastContact: true,
            createdAt: true,
            updatedAt: true,
            // Include review request count
            _count: {
              select: {
                reviewRequests: true,
              },
            },
          },
        });
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
    })
  );

  // Update customer (RLS ensures only business-owned customers can be updated)
  const updateCustomerSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    tags: z.array(z.string()).optional(),
  });

  fastify.put(
    '/:id',
    withBusinessContextRoute(async (request: BusinessContextRequest, reply) => {
      const { id } = getCustomerParamsSchema.parse(request.params);
      const data = updateCustomerSchema.parse(request.body);

      const customer = await executeInBusinessContext(request, async () => {
        // Update customer - RLS ensures only business-owned customers are updated
        return prisma.customer.update({
          where: {
            id,
            // RLS handles business filtering automatically
          },
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
      });

      const response: ApiSuccessResponse<typeof customer> = {
        success: true,
        data: customer,
      };

      return reply.send(response);
    })
  );

  // Soft delete customer (RLS ensures only business-owned customers can be deleted)
  fastify.delete(
    '/:id',
    withBusinessContextRoute(async (request: BusinessContextRequest, reply) => {
      const { id } = getCustomerParamsSchema.parse(request.params);

      await executeInBusinessContext(request, async () => {
        // Soft delete - RLS ensures only business-owned customers are affected
        await prisma.customer.update({
          where: {
            id,
            // RLS handles business filtering
          },
          data: {
            isActive: false,
            updatedAt: new Date(),
          },
        });
      });

      const response: ApiSuccessResponse<{}> = {
        success: true,
        data: {},
      };

      return reply.send(response);
    })
  );

  // Bulk import customers with CSV parsing
  const importCustomersSchema = z.object({
    customers: z
      .array(
        z.object({
          firstName: z.string().min(1).max(100),
          lastName: z.string().max(100).optional(),
          email: z.string().email().optional(),
          phone: z.string().max(20).optional(),
          address: z.string().max(500).optional(),
          notes: z.string().max(1000).optional(),
          tags: z.array(z.string()).default([]),
        })
      )
      .min(1)
      .max(1000), // Limit bulk operations
  });

  fastify.post(
    '/import',
    withBusinessContextRoute(async (request: BusinessContextRequest, reply) => {
      const { customers } = importCustomersSchema.parse(request.body);

      const result = await executeInBusinessContext(request, async () => {
        // Validate each customer has at least one contact method
        const validCustomers = customers.filter(customer => customer.email || customer.phone);

        if (validCustomers.length === 0) {
          throw new Error('No valid customers found - each customer must have email or phone');
        }

        // Use transaction for bulk insert
        // RLS automatically ensures all customers are created with correct businessId
        return prisma.$transaction(
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
      });

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          imported: result.length,
          skipped: customers.length - result.length,
        },
      };

      return reply.status(201).send(response);
    })
  );
};

export default customerRoutes;
