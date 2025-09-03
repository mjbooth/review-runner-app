import { type NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import { getOrCreateUser } from '@/services/users';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import type { Customer } from '@/components/dashboard/customers/types';

// GET /api/customers - List customers with pagination
const listCustomersSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  search: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags
});

const createCustomerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

// Transform database customer to frontend Customer interface
function transformCustomerForFrontend(customer: {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  reviewRequests?: { status: string }[];
}): Customer {
  // Calculate derived status based on customer data and review requests
  const getCustomerStatus = () => {
    // Missing required fields = Draft
    if (!customer.firstName || (!customer.email && !customer.phone)) {
      return 'Draft';
    }

    // No review requests = Ready
    if (!customer.reviewRequests || customer.reviewRequests.length === 0) {
      return 'Ready';
    }

    // Get latest review request to determine status (we only fetch 1 now)
    const latestRequest = customer.reviewRequests?.[0];

    switch (latestRequest.status) {
      case 'QUEUED':
        return 'Scheduled';
      case 'SENT':
      case 'DELIVERED':
        return 'Review Sent';
      case 'CLICKED':
        return 'Review Clicked';
      case 'FAILED':
      case 'BOUNCED':
        return 'Review Failed';
      case 'FOLLOWUP_SENT':
        return 'Follow-up Sent';
      case 'COMPLETED':
        return latestRequest.clickedAt ? 'Follow-up Clicked' : 'Review Clicked';
      case 'OPTED_OUT':
        return 'Review Failed';
      default:
        return 'Ready';
    }
  };

  const getCustomerChannel = (): 'email' | 'sms' | null => {
    if (!customer.email && customer.phone) return 'sms';
    if (customer.email && !customer.phone) return 'email';
    if (customer.email && customer.phone) return 'email'; // Prefer email if both
    return null;
  };

  const getCustomerActions = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'Complete Info';
      case 'Ready':
        return 'Send Review';
      case 'Scheduled':
        return 'Cancel Request';
      case 'Review Sent':
        return 'Send Follow-up';
      case 'Review Clicked':
        return 'Send Follow-up';
      case 'Review Failed':
        return 'Fix Contact Info';
      case 'Follow-up Sent':
        return 'Mark Completed';
      case 'Follow-up Clicked':
        return 'Send New Campaign';
      case 'Follow-up Failed':
        return 'Retry Follow-up';
      default:
        return 'Send Review';
    }
  };

  const status = getCustomerStatus();
  const channel = getCustomerChannel();
  const lastRequest =
    customer.reviewRequests && customer.reviewRequests.length > 0
      ? customer.reviewRequests[0].createdAt
      : null;

  return {
    id: customer.id,
    businessId: customer.businessId,
    firstName: customer.firstName,
    lastName: customer.lastName || '',
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || null,
    notes: customer.notes || null,
    tags: customer.tags || null,
    dateAdded: customer.createdAt,
    suppressed: 'active', // TODO: Check suppressions table
    lastRequest: lastRequest,
    status: status,
    channel: channel,
    actions: getCustomerActions(status),
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get business context
    let businessId: string;
    try {
      const context = await getBusinessContext();
      businessId = context.businessId;
    } catch (error: unknown) {
      // Handle specific business context errors
      if (
        error.message?.includes('BUSINESS_NOT_FOUND') ||
        error.message?.includes('USER_NOT_FOUND')
      ) {
        // Auto-create user and business as fallback
        try {
          // User/business not found, attempting auto-creation

          const { userId: clerkUserId } = await auth();
          if (!clerkUserId) {
            throw new Error('Not authenticated');
          }

          // Get Clerk user data
          const clerkUser = await currentUser();
          if (!clerkUser) {
            throw new Error('Clerk user not found');
          }

          // Get primary email
          const primaryEmail = clerkUser.emailAddresses.find(
            e => e.id === clerkUser.primaryEmailAddressId
          );

          if (!primaryEmail) {
            throw new Error('No primary email found');
          }

          // Create user with business (this will auto-create business)
          await getOrCreateUser({
            clerkUserId: clerkUser.id,
            email: primaryEmail.emailAddress,
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            imageUrl: clerkUser.imageUrl,
          });

          // Auto-created user and business successfully

          // Now try to get business context again
          const context = await getBusinessContext();
          businessId = context.businessId;
        } catch (creationError) {
          console.error('Failed to auto-create user/business:', creationError);
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'BUSINESS_NOT_FOUND',
                message: 'No business found for this user. Please complete onboarding.',
              },
            } satisfies ApiErrorResponse,
            { status: 404 }
          );
        }
      } else {
        throw error; // Re-throw other errors
      }
    }

    const url = new URL(request.url);
    const query = listCustomersSchema.parse({
      page: url.searchParams.get('page') || '1',
      limit: url.searchParams.get('limit') || '20',
      search: url.searchParams.get('search') || undefined,
      tags: url.searchParams.get('tags') || undefined,
    });

    const { page, limit, search, tags } = query;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      businessId: businessId,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      where.tags = { hasSome: tagArray };
    }

    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          businessId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          address: true,
          notes: true,
          tags: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          // Only fetch the latest review request to reduce data transfer
          reviewRequests: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1, // Only get the latest request
            select: {
              status: true,
              channel: true,
              sentAt: true,
              clickedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      // Use approximate count for large datasets to improve performance
      search || tags ? prisma.customer.count({ where }) : undefined,
    ]);

    // For non-search queries, estimate total count to save query time
    const finalTotalCount =
      totalCount ??
      (customers.length === limit ? limit * page + 1 : (page - 1) * limit + customers.length);
    const totalPages = Math.ceil(finalTotalCount / limit);
    const hasNextPage = customers.length === limit; // If we got full page, assume there's more
    const hasPreviousPage = page > 1;

    // Transform customers for frontend
    const transformedCustomers = customers.map(transformCustomerForFrontend);

    const response: ApiSuccessResponse<Customer[]> = {
      success: true,
      data: transformedCustomers,
      meta: {
        pagination: {
          page,
          limit,
          totalCount: finalTotalCount,
          totalPages,
          hasNextPage,
          hasPrevPage: hasPreviousPage,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customers' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get business context from authenticated user
    let businessId: string;
    try {
      const context = await getBusinessContext();
      businessId = context.businessId;
    } catch (error: unknown) {
      // Handle specific business context errors
      if (error.message?.includes('BUSINESS_NOT_FOUND')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BUSINESS_NOT_FOUND',
              message: 'No business found for this user. Please complete onboarding.',
            },
          } satisfies ApiErrorResponse,
          { status: 404 }
        );
      }
      throw error; // Re-throw other errors
    }

    const body = await request.json();
    const customerData = createCustomerSchema.parse(body);

    const customer = await prisma.customer.create({
      data: {
        ...customerData,
        businessId: businessId,
      },
      include: {
        reviewRequests: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            channel: true,
            sentAt: true,
            clickedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const transformedCustomer = transformCustomerForFrontend(customer);

    const response: ApiSuccessResponse<Customer> = {
      success: true,
      data: transformedCustomer,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid customer data',
            details: error.errors,
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create customer' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
