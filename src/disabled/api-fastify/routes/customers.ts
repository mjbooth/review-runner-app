import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';

const customerRoutes: FastifyPluginAsync = async function (fastify) {
  // List customers with pagination
  const listCustomersSchema = z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
    search: z.string().optional(),
    tags: z.string().optional(), // Comma-separated tags
  });

  fastify.get('/', async (request, reply) => {
    try {
      const query = listCustomersSchema.parse(request.query);
      const { page, limit, search, tags } = query;

      const offset = (page - 1) * limit;

      const where: any = {
        businessId: request.businessId!,
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
            address: true,
            tags: true,
            lastContact: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { reviewRequests: true },
            },
          },
        }),
        prisma.customer.count({ where }),
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

      const response: ApiSuccessResponse<typeof customers> = {
        success: true,
        data: customers,
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

  // Create customer
  const createCustomerSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).default([]),
  });

  fastify.post('/', async (request, reply) => {
    try {
      const data = createCustomerSchema.parse(request.body);

      // Validate that at least email or phone is provided
      if (!data.email && !data.phone) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Either email or phone number is required',
          },
        };
        return reply.code(400).send(response);
      }

      const customer = await prisma.customer.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName || null,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          notes: data.notes || null,
          tags: data.tags,
          businessId: request.businessId!,
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
        },
      });

      const response: ApiSuccessResponse<typeof customer> = {
        success: true,
        data: customer,
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

  // Get customer by ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const customer = await prisma.customer.findFirst({
        where: {
          id,
          businessId: request.businessId!,
          isActive: true,
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
          reviewRequests: {
            select: {
              id: true,
              channel: true,
              status: true,
              createdAt: true,
              sentAt: true,
              clickedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!customer) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<typeof customer> = {
        success: true,
        data: customer,
      };

      return reply.send(response);
    } catch (error) {
      throw error;
    }
  });

  // Update customer
  const updateCustomerSchema = createCustomerSchema.partial();

  fastify.put('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsedData = updateCustomerSchema.parse(request.body);

      // Filter out undefined values for exactOptionalPropertyTypes compatibility
      const data = Object.fromEntries(
        Object.entries(parsedData).filter(([_, value]) => value !== undefined)
      );

      const customer = await prisma.customer.updateMany({
        where: {
          id,
          businessId: request.businessId!,
          isActive: true,
        },
        data,
      });

      if (customer.count === 0) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
        };
        return reply.code(404).send(response);
      }

      // Fetch updated customer
      const updatedCustomer = await prisma.customer.findUnique({
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
          createdAt: true,
          updatedAt: true,
        },
      });

      const response: ApiSuccessResponse<typeof updatedCustomer> = {
        success: true,
        data: updatedCustomer,
      };

      return reply.send(response);
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

  // Delete customer (soft delete)
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const customer = await prisma.customer.updateMany({
        where: {
          id,
          businessId: request.businessId!,
          isActive: true,
        },
        data: { isActive: false },
      });

      if (customer.count === 0) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<{ message: string }> = {
        success: true,
        data: { message: 'Customer deleted successfully' },
      };

      return reply.send(response);
    } catch (error) {
      throw error;
    }
  });
};

export default customerRoutes;
