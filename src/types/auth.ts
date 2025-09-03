/**
 * Authentication Types for Review Runner
 *
 * Comprehensive type definitions for Clerk integration, business context,
 * and Row Level Security authentication system.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Clerk JWT payload structure
 */
export interface ClerkJWTPayload {
  /** Clerk user ID */
  sub: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** JWT ID */
  jti: string;
  /** Issuer */
  iss: string;
  /** Audience */
  aud: string;
  /** Session ID */
  sid?: string;
  /** Organization ID (if user belongs to organization) */
  org_id?: string;
  /** Organization slug */
  org_slug?: string;
  /** Organization role */
  org_role?: string;
  /** Organization permissions */
  org_permissions?: string[];
  /** User metadata */
  metadata?: {
    public?: Record<string, any>;
    private?: Record<string, any>;
    unsafe?: Record<string, any>;
  };
  /** Custom claims */
  [key: string]: any;
}

/**
 * Authenticated user information
 */
export interface AuthenticatedUser {
  /** Clerk user ID */
  clerkUserId: string;
  /** Session ID from JWT */
  sessionId?: string;
  /** Organization information if applicable */
  organization?: {
    id: string;
    slug?: string;
    role?: string;
    permissions?: string[];
  };
  /** User metadata */
  metadata?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    [key: string]: any;
  };
}

/**
 * Business context information
 */
export interface BusinessContext {
  /** Database business ID (UUID) */
  businessId: string;
  /** Business name */
  businessName?: string;
  /** Whether business is active */
  isActive: boolean;
  /** Clerk organization ID mapping (if using organizations) */
  clerkOrgId?: string;
  /** User role within business */
  role?: 'owner' | 'admin' | 'member';
  /** Business permissions */
  permissions?: string[];
}

/**
 * Complete authentication context
 */
export interface AuthContext {
  /** Authenticated user information */
  user: AuthenticatedUser;
  /** Business context */
  business: BusinessContext;
  /** Authentication timestamp */
  authenticatedAt: Date;
  /** Token expiration */
  expiresAt: Date;
}

/**
 * Authentication error types
 */
export type AuthErrorCode =
  | 'NO_TOKEN'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'TOKEN_VERIFICATION_FAILED'
  | 'USER_NOT_FOUND'
  | 'BUSINESS_NOT_FOUND'
  | 'BUSINESS_INACTIVE'
  | 'BUSINESS_ACCESS_DENIED'
  | 'ORGANIZATION_ACCESS_DENIED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'RATE_LIMITED'
  | 'AUTH_CONTEXT_ERROR';

/**
 * Authentication error structure
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: string;
  retryAfter?: number; // For rate limiting
}

/**
 * Authentication levels for route protection
 */
export type AuthLevel =
  | 'none' // Public route
  | 'optional' // Auth optional, business context if authenticated
  | 'required' // Must be authenticated with business context
  | 'admin' // Must be business admin/owner
  | 'system'; // Internal system routes only

/**
 * Route protection configuration
 */
export interface RouteProtectionConfig {
  /** Authentication level required */
  level: AuthLevel;
  /** Required permissions (if any) */
  permissions?: string[];
  /** Custom validation function */
  validator?: (authContext: AuthContext) => Promise<boolean> | boolean;
  /** Rate limiting configuration */
  rateLimit?: {
    max: number;
    windowMs: number;
  };
}

/**
 * Enhanced Fastify request with authentication context
 */
export interface AuthenticatedRequest extends FastifyRequest {
  /** Complete authentication context */
  auth?: AuthContext;
  /** Quick access to user info */
  authUser?: AuthenticatedUser;
  /** Quick access to business context */
  business?: BusinessContext;
  /** Quick access to business ID for RLS */
  businessId?: string;
  /** Clerk user ID for convenience */
  clerkUserId?: string;
}

/**
 * Authentication middleware options
 */
export interface AuthMiddlewareOptions {
  /** Skip authentication for these paths */
  skipPaths?: string[];
  /** Enable rate limiting */
  enableRateLimit?: boolean;
  /** Rate limit configuration */
  rateLimit?: {
    max: number;
    windowMs: number;
    skipSuccessfulRequests?: boolean;
  };
  /** JWT verification options */
  jwtOptions?: {
    algorithms?: string[];
    issuer?: string;
    audience?: string;
  };
  /** Business context options */
  businessContext?: {
    /** Allow users without business */
    allowNoBusiness?: boolean;
    /** Cache business context duration (ms) */
    cacheDuration?: number;
  };
  /** Security options */
  security?: {
    /** Log authentication events */
    enableLogging?: boolean;
    /** Block suspicious activity */
    blockSuspicious?: boolean;
    /** Maximum failed attempts before blocking */
    maxFailedAttempts?: number;
  };
}

/**
 * Type guard to check if request is authenticated
 */
export function isAuthenticated(request: FastifyRequest): request is AuthenticatedRequest {
  return 'auth' in request && request.auth !== undefined;
}

/**
 * Type guard to check if request has business context
 */
export function hasBusinessContext(request: FastifyRequest): request is AuthenticatedRequest & {
  business: BusinessContext;
  businessId: string;
} {
  return (
    isAuthenticated(request) && request.business !== undefined && request.businessId !== undefined
  );
}

/**
 * Authentication event for logging/monitoring
 */
export interface AuthEvent {
  /** Event type */
  type:
    | 'login'
    | 'logout'
    | 'token_refresh'
    | 'access_denied'
    | 'rate_limited'
    | 'suspicious_activity';
  /** User ID (if available) */
  userId?: string;
  /** Business ID (if available) */
  businessId?: string;
  /** IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Request path */
  path?: string;
  /** Request method */
  method?: string;
  /** Error details (if applicable) */
  error?: AuthError;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Multi-business user mapping
 */
export interface UserBusinessMapping {
  /** Clerk user ID */
  clerkUserId: string;
  /** Available businesses for this user */
  businesses: Array<{
    businessId: string;
    businessName: string;
    role: string;
    isActive: boolean;
    clerkOrgId?: string;
  }>;
  /** Default business (most recently accessed) */
  defaultBusinessId?: string;
}

/**
 * Route handler with authentication context
 */
export type AuthenticatedRouteHandler = (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => Promise<void> | void;

/**
 * Authentication plugin registration options
 */
export interface AuthPluginOptions extends AuthMiddlewareOptions {
  /** Plugin name */
  name?: string;
  /** Enable automatic business context setting */
  enableBusinessContext?: boolean;
  /** Clerk configuration */
  clerk?: {
    publishableKey: string;
    secretKey: string;
    jwksUrl?: string;
  };
}
