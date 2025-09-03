import { type PrismaClient, type Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { validateBusinessScope } from '../validators/reviewRequest';

// Type-safe business-scoped query builder
export class BusinessScopedQuery {
  private businessId: string;
  private db: PrismaClient;

  constructor(businessId: string, dbInstance: PrismaClient = prisma) {
    this.businessId = businessId;
    this.db = dbInstance;
  }

  // Review Requests
  async createReviewRequest(data: Omit<Prisma.ReviewRequestCreateInput, 'business'>) {
    return this.db.reviewRequest.create({
      data: {
        ...data,
        business: { connect: { id: this.businessId } },
      },
      include: {
        customer: true,
        template: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  async createManyReviewRequests(data: Omit<Prisma.ReviewRequestCreateManyInput, 'businessId'>[]) {
    return this.db.reviewRequest.createMany({
      data: data.map(item => ({
        ...item,
        businessId: this.businessId,
      })),
    });
  }

  async findReviewRequest(id: string) {
    const request = await this.db.reviewRequest.findFirst({
      where: {
        id,
        businessId: this.businessId,
        isActive: true,
      },
      include: {
        customer: true,
        template: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!request) {
      throw new Error('Review request not found or access denied');
    }

    return request;
  }

  async findManyReviewRequests(params: {
    where?: Prisma.ReviewRequestWhereInput;
    orderBy?: Prisma.ReviewRequestOrderByWithRelationInput[];
    take?: number;
    skip?: number;
    include?: Prisma.ReviewRequestInclude;
  }) {
    const { where = {}, orderBy, take, skip, include } = params;

    return this.db.reviewRequest.findMany({
      where: {
        ...where,
        businessId: this.businessId,
        isActive: true,
      },
      orderBy,
      take,
      skip,
      include: include || {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });
  }

  async countReviewRequests(where?: Prisma.ReviewRequestWhereInput) {
    return this.db.reviewRequest.count({
      where: {
        ...where,
        businessId: this.businessId,
        isActive: true,
      },
    });
  }

  async updateReviewRequest(id: string, data: Prisma.ReviewRequestUpdateInput) {
    // First verify the request belongs to this business
    await this.findReviewRequest(id);

    return this.db.reviewRequest.update({
      where: { id },
      data,
      include: {
        customer: true,
        template: true,
      },
    });
  }

  async deleteReviewRequest(id: string) {
    // Soft delete by setting isActive to false
    return this.updateReviewRequest(id, { isActive: false });
  }

  // Campaign functionality removed for MVP simplicity

  // Message Templates - Two-tier system (System + Business templates)
  async createMessageTemplate(data: Omit<Prisma.MessageTemplateCreateInput, 'business'>) {
    return this.db.messageTemplate.create({
      data: {
        ...data,
        businessId: data.templateType === 'system' ? null : this.businessId,
      },
    });
  }

  async findManyMessageTemplates(params: {
    where?: Prisma.MessageTemplateWhereInput;
    orderBy?: Prisma.MessageTemplateOrderByWithRelationInput[];
    take?: number;
    skip?: number;
  }) {
    const { where = {}, orderBy, take, skip } = params;

    return this.db.messageTemplate.findMany({
      where: {
        ...where,
        OR: [
          { businessId: this.businessId }, // Business-specific templates
          { templateType: 'system', businessId: null }, // System templates available to all
        ],
        isActive: true,
      },
      orderBy,
      take,
      skip,
    });
  }

  async updateMessageTemplate(id: string, data: Prisma.MessageTemplateUpdateInput) {
    // First verify the template belongs to this business or is a system template
    const template = await this.db.messageTemplate.findFirst({
      where: {
        id,
        OR: [{ businessId: this.businessId }, { templateType: 'system', businessId: null }],
        isActive: true,
      },
    });

    if (!template) {
      throw new Error('Message template not found or access denied');
    }

    // Only business templates can be updated by users
    if (template.templateType === 'system') {
      throw new Error('System templates cannot be modified');
    }

    return this.db.messageTemplate.update({
      where: { id },
      data,
    });
  }

  // Customers
  async findManyCustomers(params: {
    where?: Prisma.CustomerWhereInput;
    orderBy?: Prisma.CustomerOrderByWithRelationInput[];
    take?: number;
    skip?: number;
  }) {
    const { where = {}, orderBy, take, skip } = params;

    return this.db.customer.findMany({
      where: {
        ...where,
        businessId: this.businessId,
        isActive: true,
      },
      orderBy,
      take,
      skip,
      include: {
        reviewRequests: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            channel: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async findCustomer(id: string) {
    const customer = await this.db.customer.findFirst({
      where: {
        id,
        businessId: this.businessId,
        isActive: true,
      },
      include: {
        reviewRequests: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new Error('Customer not found or access denied');
    }

    return customer;
  }

  // Analytics and Reports - Simplified for MVP (no cost tracking)
  async getBusinessAnalytics(params: { startDate?: Date; endDate?: Date }) {
    const { startDate, endDate } = params;
    const dateFilter =
      startDate && endDate
        ? {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }
        : {};

    const [totalRequests, requestsByStatus, requestsByChannel] = await Promise.all([
      // Total requests
      this.db.reviewRequest.count({
        where: {
          businessId: this.businessId,
          isActive: true,
          ...dateFilter,
        },
      }),

      // Requests by status
      this.db.reviewRequest.groupBy({
        by: ['status'],
        where: {
          businessId: this.businessId,
          isActive: true,
          ...dateFilter,
        },
        _count: true,
      }),

      // Requests by channel
      this.db.reviewRequest.groupBy({
        by: ['channel'],
        where: {
          businessId: this.businessId,
          isActive: true,
          ...dateFilter,
        },
        _count: true,
      }),
    ]);

    return {
      totalRequests,
      requestsByStatus,
      requestsByChannel,
    };
  }

  // Events
  async createEvent(data: Omit<Prisma.EventCreateInput, 'business'>) {
    return this.db.event.create({
      data: {
        ...data,
        business: { connect: { id: this.businessId } },
      },
    });
  }

  // Suppressions
  async findSuppressions(params: {
    where?: Prisma.SuppressionWhereInput;
    orderBy?: Prisma.SuppressionOrderByWithRelationInput[];
    take?: number;
    skip?: number;
  }) {
    const { where = {}, orderBy, take, skip } = params;

    return this.db.suppression.findMany({
      where: {
        ...where,
        businessId: this.businessId,
        isActive: true,
      },
      orderBy,
      take,
      skip,
    });
  }

  async isContactSuppressed(contact: string, channel?: 'SMS' | 'EMAIL') {
    const suppressions = await this.db.suppression.findMany({
      where: {
        businessId: this.businessId,
        contact,
        OR: [
          { channel: channel },
          { channel: null }, // Global suppressions
        ],
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    return suppressions.length > 0;
  }
}

// Utility function to create business-scoped queries
export const createBusinessScope = (businessId: string) => {
  return new BusinessScopedQuery(businessId);
};

// Transaction wrapper for business-scoped operations
export const withBusinessScopedTransaction = async <T>(
  businessId: string,
  callback: (scope: BusinessScopedQuery) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(async tx => {
    const scope = new BusinessScopedQuery(businessId, tx);
    return callback(scope);
  });
};
