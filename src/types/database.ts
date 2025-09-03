import type {
  Business,
  Customer,
  ReviewRequest,
  Event,
  Suppression,
  RequestChannel,
  RequestStatus,
  EventType,
  SuppressionReason,
} from '@prisma/client';

// Re-export Prisma types
export type {
  Business,
  Customer,
  ReviewRequest,
  Event,
  Suppression,
  RequestChannel,
  RequestStatus,
  EventType,
  SuppressionReason,
};

// Result type for operations
export type Result<T> = { success: true; data: T } | { success: false; error: string };

// Extended types with relations
export interface BusinessWithCounts extends Business {
  _count: {
    customers: number;
    reviewRequests: number;
    suppressions: number;
  };
}

export interface CustomerWithRequests extends Customer {
  reviewRequests: ReviewRequest[];
  _count?: {
    reviewRequests: number;
  };
}

export interface ReviewRequestWithCustomer extends ReviewRequest {
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'email' | 'phone'>;
}

export interface ReviewRequestWithEvents extends ReviewRequest {
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'email' | 'phone'>;
  events: Event[];
}

// Input types for creation
export interface CreateBusinessInput {
  clerkUserId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  website?: string;
  googlePlaceId?: string;
  googlePlaceName?: string;
  googleReviewUrl?: string;
  timezone?: string;
}

export interface CreateCustomerInput {
  businessId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateReviewRequestInput {
  businessId: string;
  customerId: string;
  channel: RequestChannel;
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  trackingUuid: string;
  trackingUrl: string;
  scheduledFor?: Date;
}

export interface CreateEventInput {
  businessId: string;
  reviewRequestId?: string;
  type: EventType;
  source: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateSuppressionInput {
  businessId: string;
  contact: string;
  channel?: RequestChannel;
  reason: SuppressionReason;
  source: string;
  notes?: string;
  expiresAt?: Date;
}

// Update types
export interface UpdateBusinessInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  googlePlaceId?: string;
  googlePlaceName?: string;
  googleReviewUrl?: string;
  timezone?: string;
}

export interface UpdateCustomerInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  lastContact?: Date;
}

export interface UpdateReviewRequestInput {
  status?: RequestStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  clickedAt?: Date;
  completedAt?: Date;
  followupSentAt?: Date;
  externalId?: string;
  errorMessage?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

// Query filter types
export interface BusinessQueryFilters {
  isActive?: boolean;
}

export interface CustomerQueryFilters {
  businessId: string;
  isActive?: boolean;
  search?: string;
  tags?: string[];
  hasEmail?: boolean;
  hasPhone?: boolean;
}

export interface ReviewRequestQueryFilters {
  businessId: string;
  isActive?: boolean;
  customerId?: string;
  channel?: RequestChannel;
  status?: RequestStatus | RequestStatus[];
  scheduledFor?: {
    gte?: Date;
    lte?: Date;
  };
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
}

export interface EventQueryFilters {
  businessId: string;
  reviewRequestId?: string;
  type?: EventType | EventType[];
  source?: string;
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
}

export interface SuppressionQueryFilters {
  businessId: string;
  isActive?: boolean;
  contact?: string;
  channel?: RequestChannel;
  reason?: SuppressionReason;
  expiresAt?: {
    gte?: Date;
    lte?: Date;
  };
}

// Aggregation types
export interface RequestStatusCounts {
  status: RequestStatus;
  _count: number;
}

export interface ChannelCounts {
  channel: RequestChannel;
  _count: number;
}

export interface DailyStats {
  date: Date;
  total: number;
  sent: number;
  delivered: number;
  clicked: number;
  completed: number;
  bounced: number;
  failed: number;
}
