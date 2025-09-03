// API Response Types
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Pagination Types
export interface PaginationMeta {
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Business Logic Types
export type Result<T, E = string> = { success: true; data: T } | { success: false; error: E };

// Request/Response Interfaces
export interface CreateCustomerRequest {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateReviewRequestRequest {
  customerId: string;
  channel: 'SMS' | 'EMAIL';
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  scheduledFor?: string;
}

export interface BulkReviewRequestRequest {
  customerIds: string[];
  channel: 'SMS' | 'EMAIL';
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  scheduledFor?: string;
}

// Filter Types
export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  tags?: string;
}

export interface ReviewRequestFilters {
  page?: number;
  limit?: number;
  status?: string;
  channel?: 'SMS' | 'EMAIL';
  customerId?: string;
  from?: string;
  to?: string;
}

export interface SuppressionFilters {
  page?: number;
  limit?: number;
  search?: string;
  channel?: 'SMS' | 'EMAIL';
  reason?: string;
}

// Analytics Types
export interface DashboardAnalytics {
  summary: {
    totalRequests: number;
    totalCustomers: number;
    deliveryRate: number;
    clickRate: number;
    completionRate: number;
  };
  channels: Array<{
    channel: string;
    count: number;
    percentage: number;
  }>;
  statuses: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  dailyStats: Array<{
    date: string;
    total: number;
    sent: number;
    delivered: number;
    clicked: number;
    completed: number;
  }>;
  recentActivity: Array<{
    id: string;
    customerName: string;
    status: string;
    channel: string;
    createdAt: Date;
  }>;
  dateRange: {
    from: string;
    to: string;
    period: string;
  };
}
