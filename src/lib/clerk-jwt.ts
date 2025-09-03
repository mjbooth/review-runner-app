/**
 * Clerk JWT Validation and Token Management
 *
 * Handles Clerk JWT token validation, decoding, and user information extraction
 * with comprehensive error handling and security measures.
 */

import { createClerkClient } from '@clerk/backend';
import { verifyToken } from '@clerk/backend';
import { logger } from './logger';
import type { ClerkJWTPayload, AuthenticatedUser, AuthError, AuthErrorCode } from '../types/auth';

/**
 * Clerk JWT validation error
 */
export class ClerkJWTError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'ClerkJWTError';
  }
}

/**
 * Configuration for Clerk JWT operations
 */
interface ClerkJWTConfig {
  secretKey: string;
  publishableKey: string;
  jwtKey?: string;
  issuer?: string;
  leeway?: number; // Clock skew tolerance in seconds
}

/**
 * Clerk JWT validation and user management class
 */
export class ClerkJWTValidator {
  private clerk: ReturnType<typeof createClerkClient>;
  private config: ClerkJWTConfig;

  constructor(config: ClerkJWTConfig) {
    this.config = config;
    this.clerk = createClerkClient({
      secretKey: config.secretKey,
      publishableKey: config.publishableKey,
    });
  }

  /**
   * Validate and decode a Clerk JWT token
   *
   * @param token - JWT token string
   * @param options - Additional validation options
   * @returns Decoded JWT payload
   */
  async validateToken(
    token: string,
    options: {
      audience?: string;
      authorizedParties?: string[];
      clockSkewTolerance?: number;
    } = {}
  ): Promise<ClerkJWTPayload> {
    try {
      if (!token) {
        throw new ClerkJWTError('NO_TOKEN', 'No token provided');
      }

      // Remove Bearer prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '');

      logger.debug('Validating Clerk JWT token', {
        tokenLength: cleanToken.length,
        hasOptions: Object.keys(options).length > 0,
      });

      // Use Clerk's built-in token verification
      const payload = await verifyToken(cleanToken, {
        secretKey: this.config.secretKey,
        jwtKey: this.config.jwtKey,
        audience: options.audience,
        authorizedParties: options.authorizedParties,
        clockSkewTolerance: options.clockSkewTolerance || this.config.leeway || 5,
      });

      // Additional payload validation
      if (!payload.sub) {
        throw new ClerkJWTError('INVALID_TOKEN', 'Token missing required subject (user ID)');
      }

      // Check token expiration with some leeway
      const now = Math.floor(Date.now() / 1000);
      const leeway = this.config.leeway || 5;

      if (payload.exp && payload.exp < now - leeway) {
        throw new ClerkJWTError(
          'EXPIRED_TOKEN',
          'Token has expired',
          `Token expired at ${new Date(payload.exp * 1000).toISOString()}`
        );
      }

      if (payload.iat && payload.iat > now + leeway) {
        throw new ClerkJWTError('INVALID_TOKEN', 'Token issued in the future');
      }

      logger.debug('JWT token validated successfully', {
        userId: payload.sub,
        sessionId: payload.sid,
        orgId: payload.org_id,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'never',
      });

      return payload as ClerkJWTPayload;
    } catch (error) {
      if (error instanceof ClerkJWTError) {
        throw error;
      }

      // Handle Clerk-specific errors
      if (error && typeof error === 'object' && 'code' in error) {
        const clerkError = error as any;

        switch (clerkError.code) {
          case 'jwt_invalid_signature':
          case 'jwt_invalid_format':
            throw new ClerkJWTError(
              'INVALID_TOKEN',
              'Invalid token signature or format',
              clerkError.message
            );

          case 'jwt_expired':
            throw new ClerkJWTError('EXPIRED_TOKEN', 'Token has expired', clerkError.message);

          case 'jwt_not_active_yet':
            throw new ClerkJWTError('INVALID_TOKEN', 'Token not active yet', clerkError.message);

          default:
            throw new ClerkJWTError(
              'TOKEN_VERIFICATION_FAILED',
              'Token verification failed',
              clerkError.message || String(error)
            );
        }
      }

      logger.error('Unexpected JWT validation error', {
        error: error instanceof Error ? error.message : String(error),
        tokenLength: token?.length || 0,
      });

      throw new ClerkJWTError(
        'TOKEN_VERIFICATION_FAILED',
        'Token verification failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Extract user information from JWT payload
   *
   * @param payload - Validated JWT payload
   * @returns User information object
   */
  extractUserInfo(payload: ClerkJWTPayload): AuthenticatedUser {
    const user: AuthenticatedUser = {
      clerkUserId: payload.sub,
      sessionId: payload.sid,
    };

    // Extract organization information if present
    if (payload.org_id) {
      user.organization = {
        id: payload.org_id,
        slug: payload.org_slug,
        role: payload.org_role,
        permissions: payload.org_permissions,
      };
    }

    // Extract user metadata if present
    if (payload.metadata) {
      user.metadata = {
        ...payload.metadata.public,
        ...payload.metadata.unsafe, // Include unsafe metadata for internal use
      };
    }

    return user;
  }

  /**
   * Get detailed user information from Clerk API
   *
   * @param clerkUserId - Clerk user ID
   * @returns Detailed user information
   */
  async getUserDetails(clerkUserId: string): Promise<{
    user: AuthenticatedUser;
    email?: string;
    firstName?: string;
    lastName?: string;
    organizations?: Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }>;
  }> {
    try {
      logger.debug('Fetching user details from Clerk', { clerkUserId });

      // Get user from Clerk
      const user = await this.clerk.users.getUser(clerkUserId);

      // Get user's organizations
      const organizations = await this.clerk.users.getOrganizationMembershipList({
        userId: clerkUserId,
      });

      const userInfo: AuthenticatedUser = {
        clerkUserId: user.id,
        metadata: {
          email: user.emailAddresses[0]?.emailAddress,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          imageUrl: user.imageUrl,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };

      const orgInfo = organizations.data.map(membership => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug || '',
        role: membership.role,
      }));

      logger.debug('User details fetched successfully', {
        clerkUserId,
        email: userInfo.metadata?.email,
        organizationCount: orgInfo.length,
      });

      return {
        user: userInfo,
        email: userInfo.metadata?.email as string,
        firstName: userInfo.metadata?.firstName as string,
        lastName: userInfo.metadata?.lastName as string,
        organizations: orgInfo,
      };
    } catch (error) {
      logger.error('Failed to fetch user details from Clerk', {
        clerkUserId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ClerkJWTError(
        'USER_NOT_FOUND',
        'Failed to fetch user details',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Validate organization access for a user
   *
   * @param clerkUserId - Clerk user ID
   * @param organizationId - Organization ID to validate access to
   * @returns Organization membership details if access granted
   */
  async validateOrganizationAccess(
    clerkUserId: string,
    organizationId: string
  ): Promise<{
    hasAccess: boolean;
    role?: string;
    permissions?: string[];
  }> {
    try {
      const membership = await this.clerk.organizations.getOrganizationMembership({
        organizationId,
        userId: clerkUserId,
      });

      return {
        hasAccess: true,
        role: membership.role,
        permissions: [], // Clerk doesn't expose detailed permissions by default
      };
    } catch (error: any) {
      // If user is not a member, Clerk throws an error
      if (error.status === 404 || error.code === 'resource_not_found') {
        logger.debug('User does not have access to organization', {
          clerkUserId,
          organizationId,
        });

        return { hasAccess: false };
      }

      logger.error('Error validating organization access', {
        clerkUserId,
        organizationId,
        error: error.message || String(error),
      });

      throw new ClerkJWTError(
        'ORGANIZATION_ACCESS_DENIED',
        'Failed to validate organization access',
        error.message || String(error)
      );
    }
  }

  /**
   * Extract authorization header from request
   *
   * @param headers - Request headers
   * @returns Bearer token or null
   */
  static extractTokenFromHeaders(headers: Record<string, any>): string | null {
    const authorization = headers.authorization || headers.Authorization;

    if (!authorization) {
      return null;
    }

    if (typeof authorization !== 'string') {
      return null;
    }

    // Support both "Bearer token" and just "token" formats
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }

    // If no Bearer prefix, assume the entire header is the token
    return authorization;
  }

  /**
   * Create authentication error response
   *
   * @param error - Authentication error
   * @returns Formatted error response
   */
  static createErrorResponse(error: ClerkJWTError | AuthError): {
    success: false;
    error: AuthError;
  } {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: 'details' in error ? error.details : undefined,
      },
    };
  }
}

/**
 * Create a singleton Clerk JWT validator instance
 */
let clerkJWTValidator: ClerkJWTValidator | null = null;

/**
 * Get or create the Clerk JWT validator instance
 *
 * @param config - Configuration options (required on first call)
 * @returns Clerk JWT validator instance
 */
export function getClerkJWTValidator(config?: ClerkJWTConfig): ClerkJWTValidator {
  if (!clerkJWTValidator) {
    if (!config) {
      throw new Error('ClerkJWTValidator config required for first initialization');
    }
    clerkJWTValidator = new ClerkJWTValidator(config);
  }
  return clerkJWTValidator;
}

/**
 * Utility function to validate JWT token
 *
 * @param token - JWT token
 * @param options - Validation options
 * @returns JWT payload and user info
 */
export async function validateClerkJWT(
  token: string,
  options?: {
    config?: ClerkJWTConfig;
    audience?: string;
    authorizedParties?: string[];
  }
): Promise<{
  payload: ClerkJWTPayload;
  user: AuthenticatedUser;
}> {
  const validator = options?.config
    ? new ClerkJWTValidator(options.config)
    : getClerkJWTValidator();

  const payload = await validator.validateToken(token, {
    audience: options?.audience,
    authorizedParties: options?.authorizedParties,
  });

  const user = validator.extractUserInfo(payload);

  return { payload, user };
}
