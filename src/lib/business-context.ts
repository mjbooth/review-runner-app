/**
 * Business Context Management for Row Level Security
 *
 * This module provides utilities for managing multi-tenant business context
 * in database operations with Row Level Security (RLS) policies.
 */

import { type PrismaClient } from '@prisma/client';
import { logger } from './logger';

/**
 * Error thrown when business context operations fail
 */
export class BusinessContextError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'BusinessContextError';
  }
}

/**
 * Interface for business context management
 */
export interface BusinessContextManager {
  setBusinessContext(clerkUserId: string, businessId?: string): Promise<string>;
  clearBusinessContext(): Promise<void>;
  getCurrentBusinessId(): Promise<string | null>;
  executeWithBusinessContext<T>(
    clerkUserId: string,
    operation: () => Promise<T>,
    businessId?: string
  ): Promise<T>;
}

/**
 * Implementation of business context management for Prisma
 */
export class PrismaBusinessContextManager implements BusinessContextManager {
  constructor(private prisma: PrismaClient) {}

  /**
   * Set business context for the current database session
   *
   * @param clerkUserId - The authenticated user's Clerk ID
   * @param businessId - Optional specific business ID to validate against
   * @returns The business ID that was set
   */
  async setBusinessContext(clerkUserId: string, businessId?: string): Promise<string> {
    try {
      // Use the safe_set_business_context function which validates the user
      const result = await this.prisma.$queryRaw<[{ safe_set_business_context: string }]>`
        SELECT safe_set_business_context(${clerkUserId}, ${businessId || null}::uuid) as business_id
      `;

      const contextBusinessId = result[0]?.safe_set_business_context;

      if (!contextBusinessId) {
        throw new BusinessContextError(
          `Failed to set business context for user ${clerkUserId}`,
          'CONTEXT_SET_FAILED'
        );
      }

      logger.debug('Business context set', {
        clerkUserId,
        businessId: contextBusinessId,
        requestedBusinessId: businessId,
      });

      return contextBusinessId;
    } catch (error) {
      logger.error('Failed to set business context', {
        clerkUserId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        // Re-throw database errors as BusinessContextError
        throw new BusinessContextError(
          `Business context error: ${error.message}`,
          'DATABASE_ERROR'
        );
      }
      throw error;
    }
  }

  /**
   * Clear business context from the current session
   */
  async clearBusinessContext(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT clear_business_context()`;
      logger.debug('Business context cleared');
    } catch (error) {
      logger.error('Failed to clear business context', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw on clear errors - they're not critical
    }
  }

  /**
   * Get the current business ID from session
   *
   * @returns The current business ID or null if not set
   */
  async getCurrentBusinessId(): Promise<string | null> {
    try {
      const result = await this.prisma.$queryRaw<[{ get_current_business_id: string | null }]>`
        SELECT get_current_business_id() as business_id
      `;

      return result[0]?.get_current_business_id || null;
    } catch (error) {
      logger.error('Failed to get current business context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Execute a database operation with business context
   *
   * This is the primary method for ensuring RLS policies are enforced.
   * It sets the business context, executes the operation, and cleans up.
   *
   * @param clerkUserId - The authenticated user's Clerk ID
   * @param operation - The database operation to execute
   * @param businessId - Optional specific business ID to validate against
   * @returns The result of the operation
   */
  async executeWithBusinessContext<T>(
    clerkUserId: string,
    operation: () => Promise<T>,
    businessId?: string
  ): Promise<T> {
    const startTime = Date.now();
    let contextBusinessId: string | undefined;

    try {
      // Set business context
      contextBusinessId = await this.setBusinessContext(clerkUserId, businessId);

      // Execute the operation
      const result = await operation();

      logger.debug('Operation completed with business context', {
        clerkUserId,
        businessId: contextBusinessId,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      logger.error('Operation failed with business context', {
        clerkUserId,
        businessId: contextBusinessId,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Always clear context to prevent leakage
      await this.clearBusinessContext();
    }
  }
}

/**
 * Singleton instance for application use
 */
let businessContextManager: BusinessContextManager | null = null;

/**
 * Get the business context manager instance
 *
 * @param prisma - Prisma client instance
 * @returns Business context manager
 */
export function getBusinessContextManager(prisma: PrismaClient): BusinessContextManager {
  if (!businessContextManager) {
    businessContextManager = new PrismaBusinessContextManager(prisma);
  }
  return businessContextManager;
}

/**
 * Utility function to execute database operations with business context
 *
 * @param prisma - Prisma client instance
 * @param clerkUserId - The authenticated user's Clerk ID
 * @param operation - The database operation to execute
 * @param businessId - Optional specific business ID to validate against
 * @returns The result of the operation
 */
export async function withBusinessContext<T>(
  prisma: PrismaClient,
  clerkUserId: string,
  operation: () => Promise<T>,
  businessId?: string
): Promise<T> {
  const manager = getBusinessContextManager(prisma);
  return manager.executeWithBusinessContext(clerkUserId, operation, businessId);
}

/**
 * Type guard to check if an error is a BusinessContextError
 */
export function isBusinessContextError(error: unknown): error is BusinessContextError {
  return error instanceof BusinessContextError;
}
