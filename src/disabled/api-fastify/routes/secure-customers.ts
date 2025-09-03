/**
 * Secure Customer Routes Implementation
 *
 * Complete customer management API with comprehensive security:
 * - Input validation and sanitization
 * - Business-scoped rate limiting
 * - Resource ownership validation
 * - Business rule enforcement
 * - Audit logging and error handling
 */

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../../types/api';
import type { AuthenticatedRequest } from '../../types/auth';

// Security and validation imports
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerQuerySchema,
  customerParamsSchema,
  importCustomersSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type ImportCustomersInput,
} from '../../lib/validation-schemas';
import { createValidationMiddleware } from '../../lib/security-validation';
import { createRateLimitMiddleware } from '../../lib/business-rate-limiter';
import { createOwnershipMiddleware } from '../../lib/resource-ownership-validation';
import {
  createBusinessRulesMiddleware,
  getBusinessRulesValidator,
} from '../../lib/business-rules-validation';
import { requireAuth, requirePermissions, AuthUtils } from '../../lib/auth-helpers';

const secureCustomerRoutes: FastifyPluginAsync = async function (fastify) {
  // ==========================================
  // LIST CUSTOMERS - Secure with pagination and filtering
  // ==========================================

  fastify.get(
    '/',
    {
      preHandler: [
        // Rate limiting: data reads
        createRateLimitMiddleware('data.read', {
          quantity: request => {
            const query = request.query as any;
            return query.limit ? Math.min(parseInt(query.limit), 100) : 20;
          },
        }),
        // Business rules validation
        createBusinessRulesMiddleware(['data_retention']),
        // Input validation
        createValidationMiddleware(customerQuerySchema, { source: 'query' }),
      ],
    },
    requirePermissions(['customers:read'])(async (request: AuthenticatedRequest, reply) => {
      const query = request.query as any; // Already validated by middleware
      const { page, limit, search, tags, status, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      try {
        logger.debug('Listing customers with security validation', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          filters: { search, tags, status, sortBy, sortOrder },
          pagination: { page, limit, offset },
        });

        // Build secure query - RLS automatically filters by business
        const where: any = {};

        // Status filter
        if (status !== 'all') {
          where.isActive = status === 'active';
        }

        // Search filter (pre-sanitized by validation middleware)
        if (search) {
          where.OR = [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ];
        }

        // Tags filter
        if (tags && Array.isArray(tags)) {
          where.tags = { hasSome: tags };
        }

        // Build order by clause
        const orderBy: any = {};
        if (sortBy === 'name') {
          orderBy.firstName = sortOrder;
        } else if (sortBy === 'email') {
          orderBy.email = sortOrder;
        } else if (sortBy === 'lastContact') {
          orderBy.lastContact = sortOrder;
        } else {
          orderBy.createdAt = sortOrder;
        }

        // Execute queries with security context
        const [customers, totalCount] = await Promise.all([
          prisma.customer.findMany({
            where,
            orderBy,
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
              // Include review request summary
              _count: {
                select: {
                  reviewRequests: {
                    where: { isActive: true },
                  },
                },
              },
            },
          }),
          prisma.customer.count({ where }),
        ]);

        // Build pagination metadata
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
          meta: {
            pagination,
            filters: { search, tags, status },
          },
        };

        // Log successful operation
        logger.info('Customers listed successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          resultCount: customers.length,
          totalCount,
          page,
        });

        return reply.send(response);
      } catch (error) {
        logger.error('Failed to list customers', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
          query,
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
  // CREATE CUSTOMER - Full validation and business rules
  // ==========================================

  fastify.post(
    '/',
    {
      preHandler: [
        // Rate limiting: data writes
        createRateLimitMiddleware('data.write'),
        // Business rules validation
        createBusinessRulesMiddleware(['contact_validation', 'data_retention']),
        // Input validation with sanitization
        createValidationMiddleware(createCustomerSchema, { source: 'body', sanitize: true }),
      ],
    },
    requirePermissions(['customers:write'])(async (request: AuthenticatedRequest, reply) => {
      const data = request.body as CreateCustomerInput; // Validated and sanitized
      const businessContext = (request as any).businessContext;
      const validator = (request as any).businessRulesValidator;

      try {
        logger.debug('Creating customer with full validation', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          hasEmail: !!data.email,
          hasPhone: !!data.phone,
          tagsCount: data.tags.length,
        });

        // Validate contact information against business rules
        const contactValidation = await validator.validateContactInfo(
          data.email,
          data.phone,
          businessContext
        );

        if (!contactValidation.isValid) {
          logger.warn('Customer creation blocked by contact validation', {
            businessId: request.businessId,
            userId: request.clerkUserId,
            errors: contactValidation.errors,
            warnings: contactValidation.warnings,
          });

          return reply.status(400).send({
            success: false,
            error: {
              code: 'CONTACT_VALIDATION_FAILED',
              message: 'Contact information validation failed',
              details: {
                errors: contactValidation.errors,
                warnings: contactValidation.warnings,
              },
            },
          });
        }

        // Check for duplicate customers
        const duplicateCheck = await prisma.customer.findFirst({
          where: {
            // RLS automatically filters by business
            OR: [
              data.email ? { email: data.email } : {},
              data.phone ? { phone: data.phone } : {},
            ].filter(condition => Object.keys(condition).length > 0),
            isActive: true,
          },
          select: { id: true, email: true, phone: true },
        });

        if (duplicateCheck) {
          logger.warn('Duplicate customer detected', {
            businessId: request.businessId,
            userId: request.clerkUserId,
            duplicateId: duplicateCheck.id,
            matchedEmail: duplicateCheck.email === data.email,
            matchedPhone: duplicateCheck.phone === data.phone,
          });

          return reply.status(409).send({
            success: false,
            error: {
              code: 'DUPLICATE_CUSTOMER',
              message: 'Customer with this email or phone already exists',
              details: {
                existingId: duplicateCheck.id,
              },
            },
          });
        }

        // Create customer with transaction for data integrity
        const customer = await prisma.$transaction(async tx => {
          const newCustomer = await tx.customer.create({
            data: {
              ...data,
              // Business ID is automatically handled by RLS
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

          // Create audit event
          await tx.event.create({
            data: {
              businessId: request.businessId!,
              type: 'REQUEST_CREATED', // Could add CUSTOMER_CREATED to enum
              source: 'api',
              description: `Customer ${newCustomer.firstName} created by ${request.clerkUserId}`,
              metadata: {
                customerId: newCustomer.id,
                createdBy: request.clerkUserId,
                contactValidationWarnings: contactValidation.warnings,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
              },
            },
          });

          return newCustomer;
        });

        const response: ApiSuccessResponse<typeof customer> = {
          success: true,
          data: customer,
          meta: {
            warnings: contactValidation.warnings,
          },
        };

        logger.info('Customer created successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: customer.id,
          warningsCount: contactValidation.warnings.length,
        });

        return reply.status(201).send(response);
      } catch (error) {
        logger.error('Failed to create customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
          data: {
            hasEmail: !!data.email,
            hasPhone: !!data.phone,
            firstName: data.firstName,
          },
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
  // GET SINGLE CUSTOMER - With ownership validation
  // ==========================================

  fastify.get(
    '/:id',
    {
      preHandler: [
        // Rate limiting: data reads
        createRateLimitMiddleware('data.read'),
        // Ownership validation
        createOwnershipMiddleware('customer', {
          resourceIdParam: 'id',
          operation: 'read',
        }),
        // Input validation
        createValidationMiddleware(customerParamsSchema, { source: 'params' }),
      ],
    },
    requirePermissions(['customers:read'])(async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as any;

      try {
        // Customer is pre-validated by ownership middleware
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
            // Include recent review requests
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
                completedAt: true,
              },
            },
            // Include counts
            _count: {
              select: {
                reviewRequests: {
                  where: { isActive: true },
                },
              },
            },
          },
        });

        if (!customer) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          });
        }

        const response: ApiSuccessResponse<typeof customer> = {
          success: true,
          data: customer,
        };

        logger.debug('Customer retrieved successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: customer.id,
        });

        return reply.send(response);
      } catch (error) {
        logger.error('Failed to get customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'CUSTOMER_FETCH_ERROR',
            message: 'Failed to retrieve customer',
          },
        });
      }
    })
  );

  // ==========================================
  // UPDATE CUSTOMER - With validation and audit
  // ==========================================

  fastify.put(
    '/:id',
    {
      preHandler: [
        // Rate limiting: data writes
        createRateLimitMiddleware('data.write'),
        // Ownership validation
        createOwnershipMiddleware('customer', {
          resourceIdParam: 'id',
          operation: 'write',
        }),
        // Business rules validation
        createBusinessRulesMiddleware(['contact_validation']),
        // Input validation
        createValidationMiddleware(updateCustomerSchema, { source: 'body', sanitize: true }),
        createValidationMiddleware(customerParamsSchema, { source: 'params' }),
      ],
    },
    requirePermissions(['customers:write'])(async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as any;
      const data = request.body as UpdateCustomerInput;
      const businessContext = (request as any).businessContext;
      const validator = (request as any).businessRulesValidator;

      try {
        logger.debug('Updating customer with validation', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          fieldsToUpdate: Object.keys(data),
        });

        // Validate contact information if being updated
        if (data.email !== undefined || data.phone !== undefined) {
          const contactValidation = await validator.validateContactInfo(
            data.email,
            data.phone,
            businessContext
          );

          if (!contactValidation.isValid) {
            logger.warn('Customer update blocked by contact validation', {
              businessId: request.businessId,
              userId: request.clerkUserId,
              customerId: id,
              errors: contactValidation.errors,
            });

            return reply.status(400).send({
              success: false,
              error: {
                code: 'CONTACT_VALIDATION_FAILED',
                message: 'Contact information validation failed',
                details: {
                  errors: contactValidation.errors,
                  warnings: contactValidation.warnings,
                },
              },
            });
          }
        }

        // Check for duplicates if email/phone is being changed
        if (data.email || data.phone) {
          const duplicateCheck = await prisma.customer.findFirst({
            where: {
              AND: [
                { id: { not: id } }, // Exclude current customer
                {
                  OR: [
                    data.email ? { email: data.email } : {},
                    data.phone ? { phone: data.phone } : {},
                  ].filter(condition => Object.keys(condition).length > 0),
                },
              ],
              isActive: true,
            },
            select: { id: true, email: true, phone: true },
          });

          if (duplicateCheck) {
            return reply.status(409).send({
              success: false,
              error: {
                code: 'DUPLICATE_CUSTOMER',
                message: 'Another customer with this email or phone already exists',
                details: {
                  conflictingId: duplicateCheck.id,
                },
              },
            });
          }
        }

        // Update customer with transaction
        const customer = await prisma.$transaction(async tx => {
          // Get original data for audit
          const originalCustomer = await tx.customer.findUnique({
            where: { id },
            select: { firstName: true, lastName: true, email: true, phone: true, tags: true },
          });

          const updatedCustomer = await tx.customer.update({
            where: { id },
            data: {
              ...data,
              updatedAt: new Date(),
              // Update lastContact if this is a contact info change
              ...(data.email || data.phone ? { lastContact: new Date() } : {}),
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

          // Create audit event for significant changes
          const significantFields = ['email', 'phone', 'firstName', 'lastName'];
          const changedFields = significantFields.filter(
            field =>
              data[field as keyof UpdateCustomerInput] !== undefined &&
              data[field as keyof UpdateCustomerInput] !==
                originalCustomer?.[field as keyof typeof originalCustomer]
          );

          if (changedFields.length > 0) {
            await tx.event.create({
              data: {
                businessId: request.businessId!,
                type: 'REQUEST_CREATED', // Could add CUSTOMER_UPDATED
                source: 'api',
                description: `Customer ${updatedCustomer.firstName} updated by ${request.clerkUserId}`,
                metadata: {
                  customerId: updatedCustomer.id,
                  updatedBy: request.clerkUserId,
                  changedFields,
                  originalData: originalCustomer,
                  newData: data,
                  ipAddress: request.ip,
                },
              },
            });
          }

          return updatedCustomer;
        });

        const response: ApiSuccessResponse<typeof customer> = {
          success: true,
          data: customer,
        };

        logger.info('Customer updated successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: customer.id,
          fieldsUpdated: Object.keys(data),
        });

        return reply.send(response);
      } catch (error) {
        if ((error as any)?.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          });
        }

        logger.error('Failed to update customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'CUSTOMER_UPDATE_ERROR',
            message: 'Failed to update customer',
          },
        });
      }
    })
  );

  // ==========================================
  // DELETE CUSTOMER - Admin only with audit
  // ==========================================

  fastify.delete(
    '/:id',
    {
      preHandler: [
        // Rate limiting: admin operations
        createRateLimitMiddleware('admin.modify'),
        // Ownership validation
        createOwnershipMiddleware('customer', {
          resourceIdParam: 'id',
          operation: 'delete',
        }),
        // Input validation
        createValidationMiddleware(customerParamsSchema, { source: 'params' }),
      ],
    },
    requireAuth({
      level: 'required',
      validator: async authContext => {
        // Only business owners or users with explicit delete permission
        return (
          authContext.business.role === 'owner' ||
          authContext.business.permissions?.includes('customers:delete') ||
          false
        );
      },
    })(async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as any;

      try {
        logger.warn('Customer deletion requested', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          userRole: request.auth?.business.role,
        });

        // Get customer info for audit before deletion
        const customerInfo = await prisma.customer.findUnique({
          where: { id },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            _count: {
              select: {
                reviewRequests: { where: { isActive: true } },
              },
            },
          },
        });

        if (!customerInfo) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          });
        }

        // Check if customer has active campaigns
        if (customerInfo._count.reviewRequests > 0) {
          logger.warn('Attempted to delete customer with active campaigns', {
            businessId: request.businessId,
            userId: request.clerkUserId,
            customerId: id,
            activeCampaigns: customerInfo._count.reviewRequests,
          });

          return reply.status(409).send({
            success: false,
            error: {
              code: 'CUSTOMER_HAS_ACTIVE_CAMPAIGNS',
              message: `Cannot delete customer with ${customerInfo._count.reviewRequests} active campaigns`,
              details: {
                activeCampaigns: customerInfo._count.reviewRequests,
                suggestion: 'Cancel or complete campaigns before deleting customer',
              },
            },
          });
        }

        // Soft delete with transaction
        await prisma.$transaction(async tx => {
          await tx.customer.update({
            where: { id },
            data: {
              isActive: false,
              updatedAt: new Date(),
            },
          });

          // Create audit event for deletion
          await tx.event.create({
            data: {
              businessId: request.businessId!,
              type: 'ERROR_OCCURRED', // Could add CUSTOMER_DELETED
              source: 'api',
              description: `Customer ${customerInfo.firstName} ${customerInfo.lastName} deleted by ${request.clerkUserId}`,
              metadata: {
                customerId: id,
                deletedBy: request.clerkUserId,
                customerData: customerInfo,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
                deletionReason: 'user_request',
              },
            },
          });
        });

        const response: ApiSuccessResponse<{}> = {
          success: true,
          data: {},
          meta: {
            message: 'Customer deleted successfully',
          },
        };

        logger.info('Customer deleted successfully', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
        });

        return reply.send(response);
      } catch (error) {
        if ((error as any)?.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'CUSTOMER_NOT_FOUND',
              message: 'Customer not found',
            },
          });
        }

        logger.error('Failed to delete customer', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerId: id,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'CUSTOMER_DELETE_ERROR',
            message: 'Failed to delete customer',
          },
        });
      }
    })
  );

  // ==========================================
  // BULK IMPORT - Comprehensive validation
  // ==========================================

  fastify.post(
    '/import',
    {
      preHandler: [
        // Rate limiting: customer import
        createRateLimitMiddleware('customer.import', {
          quantity: request => {
            const data = request.body as any;
            return data?.customers?.length || 1;
          },
        }),
        // Business rules validation
        createBusinessRulesMiddleware(['bulk_operation_limits', 'contact_validation']),
        // Input validation
        createValidationMiddleware(importCustomersSchema, { source: 'body', sanitize: true }),
      ],
    },
    requireAuth({
      level: 'admin', // Admin required for bulk operations
    })(async (request: AuthenticatedRequest, reply) => {
      const { customers, skipDuplicates, validateOnly } = request.body as ImportCustomersInput;
      const businessContext = (request as any).businessContext;
      const validator = (request as any).businessRulesValidator;

      try {
        logger.info('Customer bulk import started', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerCount: customers.length,
          skipDuplicates,
          validateOnly,
        });

        // Validate bulk operation limits
        const bulkValidation = await validator.validateBulkOperationLimits(
          'customer_import',
          customers.length,
          businessContext
        );

        if (!bulkValidation.isValid) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'BULK_OPERATION_LIMIT_EXCEEDED',
              message: 'Bulk import limits exceeded',
              details: {
                errors: bulkValidation.errors,
                warnings: bulkValidation.warnings,
              },
            },
          });
        }

        // Validate each customer's contact information
        const validationResults = await Promise.all(
          customers.map(async (customer, index) => {
            const contactValidation = await validator.validateContactInfo(
              customer.email,
              customer.phone,
              businessContext
            );

            return {
              index,
              customer,
              isValid: contactValidation.isValid,
              errors: contactValidation.errors,
              warnings: contactValidation.warnings,
            };
          })
        );

        const validCustomers = validationResults.filter(result => result.isValid);
        const invalidCustomers = validationResults.filter(result => !result.isValid);

        // Check for duplicates within import and against existing customers
        const emailMap = new Map<string, number[]>();
        const phoneMap = new Map<string, number[]>();

        validCustomers.forEach(({ customer, index }) => {
          if (customer.email) {
            const indices = emailMap.get(customer.email) || [];
            indices.push(index);
            emailMap.set(customer.email, indices);
          }
          if (customer.phone) {
            const indices = phoneMap.get(customer.phone) || [];
            indices.push(index);
            phoneMap.set(customer.phone, indices);
          }
        });

        // Find internal duplicates
        const internalDuplicates: number[] = [];
        emailMap.forEach((indices, email) => {
          if (indices.length > 1) {
            internalDuplicates.push(...indices.slice(1));
          }
        });
        phoneMap.forEach((indices, phone) => {
          if (indices.length > 1) {
            internalDuplicates.push(...indices.slice(1));
          }
        });

        // Remove internal duplicates
        const uniqueCustomers = validCustomers.filter(
          ({ index }) => !internalDuplicates.includes(index)
        );

        // If validation only, return results
        if (validateOnly) {
          return reply.send({
            success: true,
            data: {
              validationResults: {
                total: customers.length,
                valid: uniqueCustomers.length,
                invalid: invalidCustomers.length,
                internalDuplicates: internalDuplicates.length,
              },
              invalidCustomers: invalidCustomers.map(({ index, errors }) => ({
                row: index + 1,
                errors,
              })),
              warnings: bulkValidation.warnings,
            },
          });
        }

        if (uniqueCustomers.length === 0) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'NO_VALID_CUSTOMERS',
              message: 'No valid customers found for import',
              details: {
                invalidCount: invalidCustomers.length,
                duplicateCount: internalDuplicates.length,
              },
            },
          });
        }

        // Import customers with transaction
        const result = await prisma.$transaction(async tx => {
          const importResults = [];
          const skipped = [];

          for (const { customer } of uniqueCustomers) {
            try {
              // Check for existing customer if skipDuplicates is true
              if (skipDuplicates) {
                const existing = await tx.customer.findFirst({
                  where: {
                    OR: [
                      customer.email ? { email: customer.email } : {},
                      customer.phone ? { phone: customer.phone } : {},
                    ].filter(condition => Object.keys(condition).length > 0),
                    isActive: true,
                  },
                });

                if (existing) {
                  skipped.push({
                    customer,
                    reason: 'Duplicate contact information',
                    existingId: existing.id,
                  });
                  continue;
                }
              }

              // Create customer
              const newCustomer = await tx.customer.create({
                data: {
                  ...customer,
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
              });

              importResults.push(newCustomer);
            } catch (error) {
              skipped.push({
                customer,
                reason: 'Database error during creation',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Create audit event
          await tx.event.create({
            data: {
              businessId: request.businessId!,
              type: 'REQUEST_CREATED', // Could add BULK_IMPORT_COMPLETED
              source: 'api',
              description: `Bulk customer import completed by ${request.clerkUserId}`,
              metadata: {
                importedBy: request.clerkUserId,
                totalAttempted: customers.length,
                imported: importResults.length,
                skipped: skipped.length,
                invalid: invalidCustomers.length,
                ipAddress: request.ip,
              },
            },
          });

          return { imported: importResults, skipped };
        });

        const response: ApiSuccessResponse<typeof result.imported> = {
          success: true,
          data: result.imported,
          meta: {
            summary: {
              total: customers.length,
              imported: result.imported.length,
              skipped: result.skipped.length,
              invalid: invalidCustomers.length,
            },
            skipped: result.skipped,
            invalidCustomers: invalidCustomers.map(({ index, errors }) => ({
              row: index + 1,
              errors,
            })),
            warnings: bulkValidation.warnings,
          },
        };

        logger.info('Customer bulk import completed', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          imported: result.imported.length,
          skipped: result.skipped.length,
          invalid: invalidCustomers.length,
        });

        return reply.status(201).send(response);
      } catch (error) {
        logger.error('Customer bulk import failed', {
          businessId: request.businessId,
          userId: request.clerkUserId,
          customerCount: customers.length,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'BULK_IMPORT_ERROR',
            message: 'Customer bulk import failed',
          },
        });
      }
    })
  );
};

export default secureCustomerRoutes;
