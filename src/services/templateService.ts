// Template management service for frontend integration

export interface MessageTemplate {
  id: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  channel: MessageChannel;
  subject?: string;
  content: string;
  variables: string[];
  templateType: 'system' | 'business';
  businessId?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export type MessageChannel = 'SMS' | 'EMAIL';
export type TemplateCategory =
  | 'GENERAL'
  | 'RESTAURANT'
  | 'RETAIL'
  | 'HEALTHCARE'
  | 'SERVICE'
  | 'CUSTOM';

export interface TemplateFilters {
  page?: number;
  limit?: number;
  category?: TemplateCategory | 'ALL';
  channel?: MessageChannel | 'ALL';
  templateType?: 'system' | 'business' | 'all';
  search?: string;
  sortBy?: 'name' | 'category' | 'usageCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TemplatePreviewData {
  customerName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  businessName: string;
  website?: string;
  reviewUrl: string;
}

export interface TemplatePreview {
  preview: {
    content: string;
    subject?: string;
    channel: MessageChannel;
  };
  variables: {
    detected: string[];
    missing: string[];
    invalid: string[];
    required: string[];
  };
  validation: {
    isValid: boolean;
    issues: string[];
  };
  metrics: {
    characterCount?: number;
    segments?: number;
    isOverLimit?: boolean;
    contentLength?: number;
    subjectLength?: number;
    totalLength?: number;
  };
  sampleData: TemplatePreviewData;
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  category: TemplateCategory;
  channel: MessageChannel;
  subject?: string;
  content: string;
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  subject?: string;
  content?: string;
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

class TemplateService {
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

  // Get templates with filtering and search
  async getTemplates(filters: TemplateFilters = {}): Promise<{
    templates: MessageTemplate[];
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

    if (filters.page) searchParams.set('page', filters.page.toString());
    if (filters.limit) searchParams.set('limit', filters.limit.toString());
    if (filters.category && filters.category !== 'ALL')
      searchParams.set('category', filters.category);
    if (filters.channel && filters.channel !== 'ALL') searchParams.set('channel', filters.channel);
    if (filters.templateType) searchParams.set('templateType', filters.templateType);
    if (filters.search) searchParams.set('search', filters.search);
    if (filters.sortBy) searchParams.set('sortBy', filters.sortBy);
    if (filters.sortOrder) searchParams.set('sortOrder', filters.sortOrder);

    const response = await this.fetchApi<MessageTemplate[]>(
      `/api/templates?${searchParams.toString()}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch templates');
    }

    return {
      templates: response.data,
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

  // Get single template by ID
  async getTemplate(id: string): Promise<MessageTemplate> {
    const response = await this.fetchApi<MessageTemplate>(`/api/templates/${id}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch template');
    }

    return response.data;
  }

  // Create new business template
  async createTemplate(templateData: CreateTemplateData): Promise<MessageTemplate> {
    const response = await this.fetchApi<MessageTemplate>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create template');
    }

    return response.data;
  }

  // Update business template
  async updateTemplate(id: string, updates: UpdateTemplateData): Promise<MessageTemplate> {
    const response = await this.fetchApi<MessageTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to update template');
    }

    return response.data;
  }

  // Delete business template
  async deleteTemplate(id: string): Promise<{ id: string; deleted: boolean }> {
    const response = await this.fetchApi<{ id: string; deleted: boolean }>(`/api/templates/${id}`, {
      method: 'DELETE',
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to delete template');
    }

    return response.data;
  }

  // Preview template with sample data
  async previewTemplate(
    content: string,
    channel: MessageChannel,
    subject?: string,
    sampleData?: Partial<TemplatePreviewData>
  ): Promise<TemplatePreview> {
    const response = await this.fetchApi<TemplatePreview>('/api/templates/preview', {
      method: 'POST',
      body: JSON.stringify({
        content,
        subject,
        channel,
        sampleData,
      }),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to generate template preview');
    }

    return response.data;
  }

  // Get template preview information (sample data, validation rules, etc.)
  async getPreviewInfo(): Promise<{
    sampleData: TemplatePreviewData;
    validVariables: string[];
    requiredVariables: string[];
    optionalVariables: string[];
    channelLimits: {
      SMS: {
        characterLimit: number;
        maxRecommendedLength: number;
      };
      EMAIL: {
        subjectLimit: number;
        contentLimit: number;
      };
    };
  }> {
    const response = await this.fetchApi<any>('/api/templates/preview');

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get preview information');
    }

    return response.data;
  }

  // Helper methods for template filtering and categorization
  filterByChannel(
    templates: MessageTemplate[],
    channel: MessageChannel | 'ALL'
  ): MessageTemplate[] {
    if (channel === 'ALL') return templates;
    return templates.filter(template => template.channel === channel);
  }

  filterByCategory(
    templates: MessageTemplate[],
    category: TemplateCategory | 'ALL'
  ): MessageTemplate[] {
    if (category === 'ALL') return templates;
    return templates.filter(template => template.category === category);
  }

  filterByType(
    templates: MessageTemplate[],
    type: 'system' | 'business' | 'all'
  ): MessageTemplate[] {
    if (type === 'all') return templates;
    return templates.filter(template => template.templateType === type);
  }

  searchTemplates(templates: MessageTemplate[], query: string): MessageTemplate[] {
    if (!query.trim()) return templates;

    const lowerQuery = query.toLowerCase();
    return templates.filter(
      template =>
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description?.toLowerCase().includes(lowerQuery) ||
        template.content.toLowerCase().includes(lowerQuery)
    );
  }

  sortTemplates(
    templates: MessageTemplate[],
    sortBy: 'name' | 'category' | 'usageCount' | 'createdAt' = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): MessageTemplate[] {
    return [...templates].sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      // Handle date strings
      if (sortBy === 'createdAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      // Handle strings
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }

  // Validate template content
  validateTemplate(
    content: string,
    subject?: string
  ): {
    isValid: boolean;
    issues: string[];
    variables: string[];
  } {
    const issues: string[] = [];

    // Extract variables from content and subject
    const contentVariables = this.extractVariables(content);
    const subjectVariables = subject ? this.extractVariables(subject) : [];
    const allVariables = [...new Set([...contentVariables, ...subjectVariables])];

    // Check for required variables
    const hasCustomerName =
      allVariables.includes('customerName') ||
      (allVariables.includes('firstName') && allVariables.includes('lastName'));
    const hasBusinessName = allVariables.includes('businessName');
    const hasReviewUrl = allVariables.includes('reviewUrl');

    if (!hasCustomerName) {
      issues.push('Template must include {{customerName}} or both {{firstName}} and {{lastName}}');
    }
    if (!hasBusinessName) {
      issues.push('Template must include {{businessName}}');
    }
    if (!hasReviewUrl) {
      issues.push('Template must include {{reviewUrl}}');
    }

    return {
      isValid: issues.length === 0,
      issues,
      variables: allVariables,
    };
  }

  // Extract personalization variables from template content
  private extractVariables(content: string): string[] {
    const matches = content.match(/{{([^}]+)}}/g);
    return matches ? matches.map(match => match.slice(2, -2).trim()) : [];
  }

  // Calculate SMS segments
  calculateSMSMetrics(content: string): {
    characterCount: number;
    segments: number;
    isOverLimit: boolean;
  } {
    const characterCount = content.length;
    const segments = Math.ceil(characterCount / 160);

    return {
      characterCount,
      segments,
      isOverLimit: characterCount > 160,
    };
  }
}

export const templateService = new TemplateService();
