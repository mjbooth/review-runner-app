/**
 * Resource Ownership Validation System
 *
 * Additional validation layer beyond RLS for sensitive operations,
 * ensuring users can only access and modify resources they own,
 * with comprehensive audit logging.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import type { AuthenticatedRequest } from '../types/auth';

// ==========================================
// OWNERSHIP VALIDATION ERROR TYPES
// ==========================================

export class OwnershipValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly resourceType: string,
    public readonly resourceId: string,
    public readonly businessId: string,
    public readonly userId: string
  ) {
    super(message);
    this.name = 'OwnershipValidationError';
  }
}

// ==========================================
// RESOURCE TYPE DEFINITIONS
// ==========================================

export type ResourceType =
  | 'customer'
  | 'review_request'
  | 'business'
  | 'suppression'
  | 'event'
  | 'bulk_operation';

/**
 * Resource validation configuration
 */
interface ResourceValidationConfig {
  /** Table name in database */
  table: string;
  /** Primary key field name */
  primaryKey: string;
  /** Business ID field name */
  businessIdField: string;
  /** Additional validation query */
  customQuery?: (resourceId: string, businessId: string) => Promise<boolean>;
  /** Fields to select for audit logging */
  auditFields?: string[];
  /** Whether to require specific permissions */
  requiredPermissions?: string[];
  /** Whether to allow inactive resources */
  allowInactive?: boolean;
}

const RESOURCE_CONFIGS: Record<ResourceType, ResourceValidationConfig> = {
  customer: {
    table: 'customer',
    primaryKey: 'id',
    businessIdField: 'business_id',
    auditFields: ['id', 'first_name', 'last_name', 'email', 'is_active'],
    allowInactive: false,
  },

  review_request: {
    table: 'review_requests',
    primaryKey: 'id',
    businessIdField: 'business_id',
    auditFields: ['id', 'customer_id', 'status', 'channel'],
    allowInactive: false,
  },

  business: {
    table: 'businesses',
    primaryKey: 'id',
    businessIdField: 'id', // Self-referential
    auditFields: ['id', 'name', 'email'],
    requiredPermissions: ['business:read'],
    allowInactive: true, // May need to access inactive business for admin
  },

  suppression: {
    table: 'suppressions',
    primaryKey: 'id',
    businessIdField: 'business_id',
    auditFields: ['id', 'contact', 'channel', 'reason'],
    allowInactive: true,
  },

  event: {
    table: 'events',
    primaryKey: 'id',
    businessIdField: 'business_id',
    auditFields: ['id', 'type', 'source'],
    requiredPermissions: ['analytics:read'],
    allowInactive: true,
  },

  bulk_operation: {
    table: 'job_executions', // Assuming job tracking table
    primaryKey: 'id',
    businessIdField: 'business_id', // Would need to add this field
    auditFields: ['id', 'job_name', 'status'],
    requiredPermissions: ['admin:read'],
    allowInactive: true,
  },
};

// ==========================================
// OWNERSHIP VALIDATION MANAGER
// ==========================================

export class ResourceOwnershipValidator {
  /**
   * Validate ownership of a single resource
   */
  async validateOwnership(
    businessId: string,
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    operation: 'read' | 'write' | 'delete' = 'read',
    options: {
      skipRLSCheck?: boolean;
      logAttempt?: boolean;
      additionalChecks?: () => Promise<boolean>;
    } = {}
  ): Promise<{
    isOwner: boolean;
    resource?: any;
    reason?: string;
  }> {
    const { skipRLSCheck = false, logAttempt = true, additionalChecks } = options;

    try {
      const config = RESOURCE_CONFIGS[resourceType];
      if (!config) {
        throw new OwnershipValidationError(
          `Unknown resource type: ${resourceType}`,
          'UNKNOWN_RESOURCE_TYPE',
          resourceType,
          resourceId,
          businessId,
          userId
        );
      }

      // Log ownership validation attempt
      if (logAttempt) {
        logger.debug('Resource ownership validation started', {
          businessId,
          userId,
          resourceType,
          resourceId,
          operation,
        });
      }

      // Build query to check ownership
      const whereClause: any = {
        [config.primaryKey]: resourceId,
      };

      // Add business ID check unless it's self-referential (business table)
      if (config.businessIdField !== config.primaryKey) {
        whereClause[config.businessIdField] = businessId;
      } else if (resourceType === 'business') {
        // For business table, the resource ID should match business ID
        if (resourceId !== businessId) {
          return {
            isOwner: false,
            reason: 'Business ID mismatch',
          };
        }
      }

      // Add active filter unless explicitly allowing inactive
      if (!config.allowInactive) {
        whereClause.is_active = true;
      }

      // Execute ownership query
      let resource;
      try {
        // Use raw query to bypass RLS if needed for double-checking
        if (skipRLSCheck) {
          const query = `
            SELECT ${config.auditFields?.join(', ') || '*'} 
            FROM ${config.table} 
            WHERE ${Object.keys(whereClause)
              .map(key => `${key} = $${Object.keys(whereClause).indexOf(key) + 1}`)
              .join(' AND ')}
          `;

          const values = Object.values(whereClause);
          const result = await prisma.$queryRawUnsafe(query, ...values);
          resource = Array.isArray(result) ? result[0] : null;
        } else {
          // Use Prisma with RLS (normal case)
          const model = (prisma as any)[config.table];
          if (!model) {
            throw new Error(`Prisma model not found for table: ${config.table}`);
          }

          resource = await model.findUnique({
            where: { [config.primaryKey]: resourceId },
            select:
              config.auditFields?.reduce((acc, field) => {
                acc[field] = true;
                return acc;
              }, {} as any) || undefined,
          });
        }
      } catch (error) {
        logger.error('Database query failed during ownership validation', {
          businessId,
          userId,
          resourceType,
          resourceId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Check if resource exists and belongs to business
      if (!resource) {
        if (logAttempt) {
          logger.warn('Resource not found or access denied', {
            businessId,
            userId,
            resourceType,
            resourceId,
            operation,
          });
        }

        return {
          isOwner: false,
          reason: 'Resource not found or access denied',
        };
      }

      // Run custom validation if provided
      if (config.customQuery) {
        try {
          const customValid = await config.customQuery(resourceId, businessId);
          if (!customValid) {
            return {
              isOwner: false,
              resource,
              reason: 'Custom validation failed',
            };
          }
        } catch (error) {
          logger.error('Custom validation failed', {
            businessId,
            userId,
            resourceType,
            resourceId,
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            isOwner: false,
            resource,
            reason: 'Custom validation error',
          };
        }
      }

      // Run additional checks if provided
      if (additionalChecks) {
        try {
          const additionalValid = await additionalChecks();
          if (!additionalValid) {
            return {
              isOwner: false,
              resource,
              reason: 'Additional validation failed',
            };
          }
        } catch (error) {
          logger.error('Additional validation failed', {
            businessId,
            userId,
            resourceType,
            resourceId,
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            isOwner: false,
            resource,
            reason: 'Additional validation error',
          };
        }
      }

      // Log successful validation
      if (logAttempt) {
        logger.debug('Resource ownership validation passed', {
          businessId,
          userId,
          resourceType,
          resourceId,
          operation,
        });
      }

      return {
        isOwner: true,
        resource,
      };
    } catch (error) {
      logger.error('Resource ownership validation failed', {
        businessId,
        userId,
        resourceType,
        resourceId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof OwnershipValidationError) {
        throw error;
      }

      throw new OwnershipValidationError(
        'Ownership validation system error',
        'VALIDATION_SYSTEM_ERROR',
        resourceType,
        resourceId,
        businessId,
        userId
      );
    }
  }

  /**
   * Validate ownership of multiple resources
   */
  async validateBulkOwnership(
    businessId: string,
    userId: string,
    resources: Array<{
      type: ResourceType;
      id: string;
    }>,
    operation: 'read' | 'write' | 'delete' = 'read'
  ): Promise<{
    allOwned: boolean;
    ownedResources: string[];
    unownedResources: Array<{ type: ResourceType; id: string; reason: string }>;
  }> {
    const ownedResources: string[] = [];
    const unownedResources: Array<{ type: ResourceType; id: string; reason: string }> = [];

    try {
      // Validate each resource
      const validations = await Promise.allSettled(
        resources.map(async resource => {
          const result = await this.validateOwnership(
            businessId,
            userId,
            resource.type,
            resource.id,
            operation,
            { logAttempt: false } // Reduce log noise for bulk operations
          );

          return {
            ...resource,
            isOwner: result.isOwner,
            reason: result.reason,
          };
        })
      );

      // Process results
      validations.forEach((validation, index) => {
        const resource = resources[index];

        if (validation.status === 'fulfilled') {
          if (validation.value.isOwner) {
            ownedResources.push(resource.id);
          } else {
            unownedResources.push({
              type: resource.type,
              id: resource.id,
              reason: validation.value.reason || 'Access denied',
            });
          }
        } else {
          unownedResources.push({
            type: resource.type,
            id: resource.id,
            reason: 'Validation failed',
          });
        }
      });

      // Log bulk validation result
      logger.info('Bulk ownership validation completed', {
        businessId,
        userId,
        operation,
        totalResources: resources.length,
        ownedCount: ownedResources.length,
        unownedCount: unownedResources.length,
      });

      return {
        allOwned: unownedResources.length === 0,
        ownedResources,
        unownedResources,
      };
    } catch (error) {
      logger.error('Bulk ownership validation failed', {
        businessId,
        userId,
        operation,
        resourceCount: resources.length,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new OwnershipValidationError(
        'Bulk ownership validation system error',
        'BULK_VALIDATION_ERROR',
        'bulk',
        resources.map(r => r.id).join(','),
        businessId,
        userId
      );
    }
  }

  /**
   * Validate business settings access
   */
  async validateBusinessSettingsAccess(
    businessId: string,
    userId: string,
    settingCategory: string,
    operation: 'read' | 'write' = 'read'
  ): Promise<{
    hasAccess: boolean;
    reason?: string;
  }> {
    try {
      // Check if user has business access
      const ownershipResult = await this.validateOwnership(
        businessId,
        userId,
        'business',
        businessId,
        operation
      );

      if (!ownershipResult.isOwner) {
        return {
          hasAccess: false,
          reason: 'Not business owner',
        };
      }

      // Category-specific access checks
      const sensitiveCategories = ['billing', 'api_keys', 'integrations', 'user_management'];

      if (sensitiveCategories.includes(settingCategory)) {
        // Additional validation for sensitive settings
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: { clerkUserId: true, isActive: true },
        });

        if (!business || !business.isActive) {
          return {
            hasAccess: false,
            reason: 'Business account inactive',
          };
        }

        if (business.clerkUserId !== userId) {
          return {
            hasAccess: false,
            reason: 'Not primary business owner',
          };
        }
      }

      logger.debug('Business settings access validated', {
        businessId,
        userId,
        settingCategory,
        operation,
      });

      return { hasAccess: true };
    } catch (error) {
      logger.error('Business settings access validation failed', {
        businessId,
        userId,
        settingCategory,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        hasAccess: false,
        reason: 'Validation system error',
      };
    }
  }

  /**
   * Log access attempt for audit trail
   */
  async logAccessAttempt(
    businessId: string,
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    operation: string,
    success: boolean,
    details?: any
  ): Promise<void> {
    try {
      await prisma.event.create({
        data: {
          businessId,
          type: success ? 'REQUEST_CREATED' : 'ERROR_OCCURRED', // You may want to add ACCESS_ATTEMPT to your enum
          source: 'security',
          description: `${operation} attempt on ${resourceType} ${resourceId} by user ${userId}`,
          metadata: {
            userId,
            resourceType,
            resourceId,
            operation,
            success,
            timestamp: new Date().toISOString(),
            ...details,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to log access attempt', {
        businessId,
        userId,
        resourceType,
        resourceId,
        operation,
        success,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ==========================================
// MIDDLEWARE FUNCTIONS
// ==========================================

/**
 * Create ownership validation middleware
 */
export function createOwnershipMiddleware(
  resourceType: ResourceType,
  options: {
    resourceIdParam?: string;
    operation?: 'read' | 'write' | 'delete';
    skipIf?: (request: AuthenticatedRequest) => boolean;
    onFailure?: (request: AuthenticatedRequest, error: OwnershipValidationError) => void;
  } = {}
) {
  const { resourceIdParam = 'id', operation = 'read', skipIf, onFailure } = options;

  return async function ownershipMiddleware(request: AuthenticatedRequest, reply: any) {
    try {
      // Skip if condition is met
      if (skipIf && skipIf(request)) {
        return;
      }

      // Get resource ID from params
      const resourceId = (request.params as any)[resourceIdParam];
      if (!resourceId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_RESOURCE_ID',
            message: `Missing ${resourceIdParam} parameter`,
          },
        });
      }

      // Get authentication context
      const businessId = request.businessId;
      const userId = request.clerkUserId;

      if (!businessId || !userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required for ownership validation',
          },
        });
      }

      // Create validator and check ownership
      const validator = new ResourceOwnershipValidator();
      const result = await validator.validateOwnership(
        businessId,
        userId,
        resourceType,
        resourceId,
        operation
      );

      if (!result.isOwner) {
        const error = new OwnershipValidationError(
          `Access denied to ${resourceType} ${resourceId}`,
          'ACCESS_DENIED',
          resourceType,
          resourceId,
          businessId,
          userId
        );

        // Log access attempt
        await validator.logAccessAttempt(
          businessId,
          userId,
          resourceType,
          resourceId,
          operation,
          false,
          { reason: result.reason }
        );

        if (onFailure) {
          onFailure(request, error);
        }

        return reply.status(403).send({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: `You don't have permission to ${operation} this ${resourceType}`,
          },
        });
      }

      // Add resource to request for potential use in handler
      (request as any).validatedResource = result.resource;
    } catch (error) {
      logger.error('Ownership validation middleware error', {
        resourceType,
        resourceId: (request.params as any)[resourceIdParam],
        businessId: request.businessId,
        userId: request.clerkUserId,
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'OWNERSHIP_VALIDATION_ERROR',
          message: 'Resource ownership validation failed',
        },
      });
    }
  };
}

/**
 * Require resource ownership decorator
 */
export function requireOwnership(
  resourceType: ResourceType,
  options?: Parameters<typeof createOwnershipMiddleware>[1]
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const middleware = createOwnershipMiddleware(resourceType, options);

    descriptor.value = async function (request: AuthenticatedRequest, reply: any) {
      await middleware.call(this, request, reply);
      if (!reply.sent) {
        return originalMethod.call(this, request, reply);
      }
    };

    return descriptor;
  };
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalValidator: ResourceOwnershipValidator | null = null;

/**
 * Get or create global ownership validator
 */
export function getOwnershipValidator(): ResourceOwnershipValidator {
  if (!globalValidator) {
    globalValidator = new ResourceOwnershipValidator();
  }
  return globalValidator;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Quick ownership check function
 */
export async function checkOwnership(
  businessId: string,
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  operation: 'read' | 'write' | 'delete' = 'read'
): Promise<boolean> {
  try {
    const validator = getOwnershipValidator();
    const result = await validator.validateOwnership(
      businessId,
      userId,
      resourceType,
      resourceId,
      operation
    );
    return result.isOwner;
  } catch (error) {
    logger.error('Quick ownership check failed', {
      businessId,
      userId,
      resourceType,
      resourceId,
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Validate multiple resource ownership
 */
export async function checkBulkOwnership(
  businessId: string,
  userId: string,
  resources: Array<{ type: ResourceType; id: string }>,
  operation: 'read' | 'write' | 'delete' = 'read'
): Promise<boolean> {
  try {
    const validator = getOwnershipValidator();
    const result = await validator.validateBulkOwnership(businessId, userId, resources, operation);
    return result.allOwned;
  } catch (error) {
    logger.error('Bulk ownership check failed', {
      businessId,
      userId,
      resourceCount: resources.length,
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
