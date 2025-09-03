/**
 * Business Context Integration for Authentication
 *
 * Integrates Clerk organizations with our database business entities and
 * manages business context for Row Level Security policies.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { withBusinessContext, BusinessContextError } from './business-context';
import { ClerkJWTError } from './clerk-jwt';
import type {
  AuthenticatedUser,
  BusinessContext,
  AuthError,
  AuthErrorCode,
  UserBusinessMapping,
} from '../types/auth';

/**
 * Business context management error
 */
export class AuthBusinessContextError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'AuthBusinessContextError';
  }
}

/**
 * Business context integration configuration
 */
interface BusinessContextConfig {
  /** Allow users without any business (for onboarding) */
  allowNoBusiness?: boolean;
  /** Cache business lookups for this duration (ms) */
  cacheDuration?: number;
  /** Maximum businesses per user */
  maxBusinessesPerUser?: number;
}

/**
 * Cached business context entry
 */
interface CachedBusinessContext {
  context: BusinessContext;
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * Business context manager for authentication
 */
export class AuthBusinessContextManager {
  private prisma: PrismaClient;
  private config: BusinessContextConfig;
  private businessCache = new Map<string, CachedBusinessContext>();

  constructor(prisma: PrismaClient, config: BusinessContextConfig = {}) {
    this.prisma = prisma;
    this.config = {
      allowNoBusiness: false,
      cacheDuration: 5 * 60 * 1000, // 5 minutes default
      maxBusinessesPerUser: 5,
      ...config,
    };
  }

  /**
   * Get business context for an authenticated user
   *
   * @param user - Authenticated user information
   * @param requestedBusinessId - Specific business ID requested (optional)
   * @returns Business context with RLS session set
   */
  async getBusinessContext(
    user: AuthenticatedUser,
    requestedBusinessId?: string
  ): Promise<BusinessContext> {
    const cacheKey = `${user.clerkUserId}:${requestedBusinessId || 'default'}`;

    try {
      // Check cache first
      const cached = this.getCachedBusinessContext(cacheKey);
      if (cached) {
        logger.debug('Using cached business context', {
          clerkUserId: user.clerkUserId,
          businessId: cached.businessId,
        });

        // Set RLS context and return
        await this.setRLSContext(user.clerkUserId, cached.businessId);
        return cached;
      }

      logger.debug('Fetching business context from database', {
        clerkUserId: user.clerkUserId,
        requestedBusinessId,
        hasOrganization: !!user.organization,
      });

      let businessContext: BusinessContext;

      // If user has Clerk organization, try to map it to our business
      if (user.organization) {
        businessContext = await this.getBusinessByOrganization(
          user.clerkUserId,
          user.organization.id,
          requestedBusinessId
        );
      } else {
        // User doesn't have organization, look up by user ID
        businessContext = await this.getBusinessByUser(user.clerkUserId, requestedBusinessId);
      }

      // Cache the result
      this.cacheBusinessContext(cacheKey, businessContext);

      // Set RLS context
      await this.setRLSContext(user.clerkUserId, businessContext.businessId);

      logger.info('Business context established', {
        clerkUserId: user.clerkUserId,
        businessId: businessContext.businessId,
        businessName: businessContext.businessName,
        role: businessContext.role,
      });

      return businessContext;
    } catch (error) {
      logger.error('Failed to get business context', {
        clerkUserId: user.clerkUserId,
        requestedBusinessId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AuthBusinessContextError) {
        throw error;
      }

      throw new AuthBusinessContextError(
        'BUSINESS_ACCESS_DENIED',
        'Failed to establish business context',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get business context by Clerk organization mapping
   */
  private async getBusinessByOrganization(
    clerkUserId: string,
    clerkOrgId: string,
    requestedBusinessId?: string
  ): Promise<BusinessContext> {
    // First, try to find business by Clerk organization ID
    let business = await this.prisma.business.findFirst({
      where: {
        clerkOrgId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        clerkUserId: true,
        clerkOrgId: true,
        isActive: true,
      },
    });

    // If no business found by org ID, create one or error
    if (!business) {
      // For now, we'll error - in production you might want to auto-create
      throw new AuthBusinessContextError(
        'BUSINESS_NOT_FOUND',
        `No business found for organization ${clerkOrgId}`,
        'Business must be created and linked to Clerk organization'
      );
    }

    // If specific business was requested, validate it matches
    if (requestedBusinessId && business.id !== requestedBusinessId) {
      throw new AuthBusinessContextError(
        'BUSINESS_ACCESS_DENIED',
        "Requested business does not match user's organization"
      );
    }

    // Determine user role (owner vs member)
    const role = business.clerkUserId === clerkUserId ? 'owner' : 'member';

    return {
      businessId: business.id,
      businessName: business.name,
      isActive: business.isActive,
      clerkOrgId: business.clerkOrgId || undefined,
      role,
      permissions: this.getRolePermissions(role),
    };
  }

  /**
   * Get business context by user ID (non-organization user)
   */
  private async getBusinessByUser(
    clerkUserId: string,
    requestedBusinessId?: string
  ): Promise<BusinessContext> {
    let whereClause: any = {
      clerkUserId,
      isActive: true,
    };

    // If specific business requested, add it to the where clause
    if (requestedBusinessId) {
      whereClause.id = requestedBusinessId;
    }

    const business = await this.prisma.business.findFirst({
      where: whereClause,
      select: {
        id: true,
        name: true,
        clerkUserId: true,
        clerkOrgId: true,
        isActive: true,
      },
      orderBy: {
        updatedAt: 'desc', // Most recently updated first
      },
    });

    if (!business) {
      if (this.config.allowNoBusiness) {
        throw new AuthBusinessContextError(
          'BUSINESS_NOT_FOUND',
          'No business account found for user',
          'User needs to complete business setup'
        );
      } else {
        throw new AuthBusinessContextError(
          'BUSINESS_NOT_FOUND',
          'No active business account found'
        );
      }
    }

    // User owns this business since it's linked to their clerkUserId
    return {
      businessId: business.id,
      businessName: business.name,
      isActive: business.isActive,
      clerkOrgId: business.clerkOrgId || undefined,
      role: 'owner',
      permissions: this.getRolePermissions('owner'),
    };
  }

  /**
   * Get all businesses accessible to a user
   */
  async getUserBusinesses(clerkUserId: string): Promise<UserBusinessMapping> {
    try {
      // Get businesses owned by user
      const ownedBusinesses = await this.prisma.business.findMany({
        where: {
          clerkUserId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          clerkOrgId: true,
          isActive: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      // TODO: Add logic for businesses where user is a member (not owner)
      // This would require a separate business_members table or similar

      const businesses = ownedBusinesses.map(business => ({
        businessId: business.id,
        businessName: business.name,
        role: 'owner' as const,
        isActive: business.isActive,
        clerkOrgId: business.clerkOrgId || undefined,
      }));

      return {
        clerkUserId,
        businesses,
        defaultBusinessId: businesses[0]?.businessId, // Most recently updated
      };
    } catch (error) {
      logger.error('Failed to get user businesses', {
        clerkUserId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AuthBusinessContextError(
        'BUSINESS_ACCESS_DENIED',
        'Failed to fetch user businesses',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Validate user has access to specific business
   */
  async validateBusinessAccess(
    clerkUserId: string,
    businessId: string
  ): Promise<{
    hasAccess: boolean;
    role?: string;
    business?: BusinessContext;
  }> {
    try {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          clerkUserId: true,
          clerkOrgId: true,
          isActive: true,
        },
      });

      if (!business) {
        return { hasAccess: false };
      }

      if (!business.isActive) {
        return { hasAccess: false };
      }

      // Check if user owns this business
      if (business.clerkUserId === clerkUserId) {
        return {
          hasAccess: true,
          role: 'owner',
          business: {
            businessId: business.id,
            businessName: business.name,
            isActive: business.isActive,
            clerkOrgId: business.clerkOrgId || undefined,
            role: 'owner',
            permissions: this.getRolePermissions('owner'),
          },
        };
      }

      // TODO: Add logic for organization members
      // For now, only owners have access

      return { hasAccess: false };
    } catch (error) {
      logger.error('Error validating business access', {
        clerkUserId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      return { hasAccess: false };
    }
  }

  /**
   * Set Row Level Security context for database queries
   */
  private async setRLSContext(clerkUserId: string, businessId: string): Promise<void> {
    try {
      // Use our existing RLS business context function
      await withBusinessContext(
        this.prisma,
        clerkUserId,
        async () => {
          // The context is set by withBusinessContext
          // This empty function just ensures the context is established
          return true;
        },
        businessId
      );
    } catch (error) {
      logger.error('Failed to set RLS context', {
        clerkUserId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AuthBusinessContextError(
        'AUTH_CONTEXT_ERROR',
        'Failed to set database context',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get permissions for a role
   */
  private getRolePermissions(role: string): string[] {
    switch (role) {
      case 'owner':
        return [
          'business:read',
          'business:write',
          'business:delete',
          'customers:read',
          'customers:write',
          'customers:delete',
          'campaigns:read',
          'campaigns:write',
          'campaigns:delete',
          'analytics:read',
          'settings:read',
          'settings:write',
        ];

      case 'admin':
        return [
          'business:read',
          'customers:read',
          'customers:write',
          'campaigns:read',
          'campaigns:write',
          'analytics:read',
          'settings:read',
        ];

      case 'member':
        return ['business:read', 'customers:read', 'campaigns:read', 'analytics:read'];

      default:
        return [];
    }
  }

  /**
   * Cache business context
   */
  private cacheBusinessContext(key: string, context: BusinessContext): void {
    if (!this.config.cacheDuration || this.config.cacheDuration <= 0) {
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.cacheDuration);

    this.businessCache.set(key, {
      context,
      cachedAt: now,
      expiresAt,
    });

    // Clean up expired entries periodically
    this.cleanExpiredCache();
  }

  /**
   * Get cached business context
   */
  private getCachedBusinessContext(key: string): BusinessContext | null {
    const cached = this.businessCache.get(key);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt < new Date()) {
      this.businessCache.delete(key);
      return null;
    }

    return cached.context;
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = new Date();

    for (const [key, cached] of this.businessCache.entries()) {
      if (cached.expiresAt < now) {
        this.businessCache.delete(key);
      }
    }
  }

  /**
   * Clear all cached business contexts
   */
  clearCache(): void {
    this.businessCache.clear();
  }

  /**
   * Clear cached context for specific user
   */
  clearUserCache(clerkUserId: string): void {
    for (const key of this.businessCache.keys()) {
      if (key.startsWith(`${clerkUserId}:`)) {
        this.businessCache.delete(key);
      }
    }
  }
}

/**
 * Singleton business context manager
 */
let authBusinessContextManager: AuthBusinessContextManager | null = null;

/**
 * Get or create the auth business context manager
 */
export function getAuthBusinessContextManager(
  prisma: PrismaClient,
  config?: BusinessContextConfig
): AuthBusinessContextManager {
  if (!authBusinessContextManager) {
    authBusinessContextManager = new AuthBusinessContextManager(prisma, config);
  }
  return authBusinessContextManager;
}

/**
 * Utility function to get business context for authenticated user
 */
export async function getBusinessContextForUser(
  prisma: PrismaClient,
  user: AuthenticatedUser,
  requestedBusinessId?: string,
  config?: BusinessContextConfig
): Promise<BusinessContext> {
  const manager = getAuthBusinessContextManager(prisma, config);
  return manager.getBusinessContext(user, requestedBusinessId);
}
