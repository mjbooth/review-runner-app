// Review request API service
import { type Customer } from '@/types/database';
import { type MessageTemplate } from '../data/messageTemplates';
import { replaceVariablesWithData } from '../data/personalizationVariables';

export interface CreateReviewRequestData {
  customerId: string;
  channel: 'SMS' | 'EMAIL';
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  scheduledFor?: string; // ISO datetime string
}

export interface CreateBulkReviewRequestData {
  customerIds: string[];
  channel: 'SMS' | 'EMAIL';
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  scheduledFor?: string;
}

export interface ReviewRequest {
  id: string;
  channel: 'SMS' | 'EMAIL';
  status: string;
  subject?: string;
  reviewUrl: string;
  trackingUuid: string;
  scheduledFor?: string;
  createdAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

export interface ReviewRequestCreationResult {
  requests: ReviewRequest[];
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errors: string[];
}

class ReviewRequestService {
  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  async createSingleReviewRequest(requestData: CreateReviewRequestData): Promise<ReviewRequest> {
    const response = await this.fetchApi<ReviewRequest>('/api/review-requests', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create review request');
    }

    return response.data;
  }

  async createBulkReviewRequests(
    requestData: CreateBulkReviewRequestData
  ): Promise<ReviewRequest[]> {
    const response = await this.fetchApi<ReviewRequest[]>('/api/review-requests', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create review requests');
    }

    return response.data;
  }

  async getCurrentBusiness(): Promise<{ id: string; googleReviewUrl?: string }> {
    const response = await this.fetchApi<{ id: string; googleReviewUrl?: string }>(
      '/api/businesses/current'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get business information');
    }

    return response.data;
  }

  private generateReviewUrl(businessData: { googleReviewUrl?: string }): string {
    // Use business's Google review URL if available, otherwise use a placeholder
    return businessData.googleReviewUrl || 'https://g.page/your-business/review';
  }

  async createReviewRequests(
    customers: Customer[],
    template: MessageTemplate,
    customMessage: string,
    customSubject: string,
    scheduledFor?: Date
  ): Promise<ReviewRequestCreationResult> {
    try {
      // Get business data for review URL generation
      const businessData = await this.getCurrentBusiness();
      const reviewUrl = this.generateReviewUrl(businessData);

      // Prepare review requests data for bulk creation
      const requestsData: CreateBulkReviewRequestData = {
        customerIds: customers.map(c => c.id),
        channel: template.channel,
        subject: customSubject || template.subject,
        messageContent: customMessage || template.content,
        reviewUrl,
        scheduledFor: scheduledFor?.toISOString(),
      };

      // Call the bulk review request creation API
      const response = await this.fetchApi<{
        requests: ReviewRequest[];
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        errors: string[];
      }>('/api/review-requests', {
        method: 'POST',
        body: JSON.stringify(requestsData),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to create review requests');
      }

      return response.data;
    } catch (error) {
      console.error('Review request creation failed:', error);

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('SUPPRESSED_CONTACTS')) {
          return {
            requests: [],
            totalRequests: customers.length,
            successfulRequests: 0,
            failedRequests: customers.length,
            errors: [
              `Some contacts are suppressed and cannot receive messages. Please review your suppression list.`,
            ],
          };
        }

        if (error.message.includes('INVALID_CUSTOMERS')) {
          return {
            requests: [],
            totalRequests: customers.length,
            successfulRequests: 0,
            failedRequests: customers.length,
            errors: [`Some selected customers are invalid or not accessible.`],
          };
        }
      }

      // Generic error handling
      return {
        requests: [],
        totalRequests: customers.length,
        successfulRequests: 0,
        failedRequests: customers.length,
        errors: [
          `Review request creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  async getReviewRequests(params?: {
    page?: number;
    limit?: number;
    status?: string;
    channel?: 'SMS' | 'EMAIL';
    customerId?: string;
    scheduledAfter?: string;
    scheduledBefore?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    requests: ReviewRequest[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.channel) searchParams.set('channel', params.channel);
    if (params?.customerId) searchParams.set('customerId', params.customerId);
    if (params?.scheduledAfter) searchParams.set('scheduledAfter', params.scheduledAfter);
    if (params?.scheduledBefore) searchParams.set('scheduledBefore', params.scheduledBefore);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

    const response = await this.fetchApi<ReviewRequest[]>(
      `/api/review-requests?${searchParams.toString()}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch review requests');
    }

    return {
      requests: response.data,
      pagination: response.meta?.pagination || {
        page: 1,
        limit: 20,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  async getReviewRequest(id: string): Promise<ReviewRequest> {
    const response = await this.fetchApi<ReviewRequest>(`/api/review-requests/${id}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch review request');
    }

    return response.data;
  }

  async updateReviewRequest(
    id: string,
    updates: {
      status?: string;
      personalizedMessage?: string;
      sentAt?: string;
      deliveredAt?: string;
      clickedAt?: string;
      completedAt?: string;
      externalId?: string;
      errorMessage?: string;
      retryCount?: number;
      deliveryStatus?: Record<string, any>;
      clickMetadata?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): Promise<ReviewRequest> {
    const response = await this.fetchApi<ReviewRequest>(`/api/review-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to update review request');
    }

    return response.data;
  }

  async deleteReviewRequest(id: string): Promise<{ id: string; deleted: boolean }> {
    const response = await this.fetchApi<{ id: string; deleted: boolean }>(
      `/api/review-requests/${id}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to delete review request');
    }

    return response.data;
  }

  // Analytics and reporting methods
  async getRequestAnalytics(params?: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
  }): Promise<{
    totalRequests: number;
    statusBreakdown: Array<{ status: string; count: number; percentage: number }>;
    channelBreakdown: Array<{ channel: string; count: number }>;
    dailyStats: Array<{ date: string; requests: number; delivered: number; clicked: number }>;
    conversionRates: {
      deliveryRate: number;
      clickRate: number;
      completionRate: number;
    };
  }> {
    const searchParams = new URLSearchParams();

    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.customerId) searchParams.set('customerId', params.customerId);

    const response = await this.fetchApi<any>(
      `/api/review-requests/analytics?${searchParams.toString()}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch analytics');
    }

    return response.data;
  }

  // Scheduled email management methods
  async getScheduledRequests(params?: {
    page?: number;
    limit?: number;
    channel?: 'SMS' | 'EMAIL';
    scheduledAfter?: string;
    scheduledBefore?: string;
  }): Promise<{
    requests: ReviewRequest[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.channel) searchParams.set('channel', params.channel);
    if (params?.scheduledAfter) searchParams.set('scheduledAfter', params.scheduledAfter);
    if (params?.scheduledBefore) searchParams.set('scheduledBefore', params.scheduledBefore);

    const response = await this.fetchApi<{
      requests: ReviewRequest[];
      pagination: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    }>(`/api/review-requests/scheduled?${searchParams.toString()}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch scheduled requests');
    }

    return response.data;
  }

  async getScheduledRequest(id: string): Promise<ReviewRequest> {
    const response = await this.fetchApi<ReviewRequest>(`/api/review-requests/scheduled/${id}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch scheduled request');
    }

    return response.data;
  }

  async cancelScheduledRequest(id: string): Promise<{
    request: ReviewRequest;
    action: 'cancel';
    message: string;
  }> {
    const response = await this.fetchApi<{
      request: ReviewRequest;
      action: 'cancel';
      message: string;
    }>(`/api/review-requests/scheduled/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        action: 'cancel',
      }),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to cancel scheduled request');
    }

    return response.data;
  }

  async rescheduleRequest(
    id: string,
    scheduledFor: Date
  ): Promise<{
    request: ReviewRequest;
    action: 'reschedule';
    message: string;
  }> {
    const response = await this.fetchApi<{
      request: ReviewRequest;
      action: 'reschedule';
      message: string;
    }>(`/api/review-requests/scheduled/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        action: 'reschedule',
        scheduledFor: scheduledFor.toISOString(),
      }),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to reschedule request');
    }

    return response.data;
  }
}

export const reviewRequestService = new ReviewRequestService();
