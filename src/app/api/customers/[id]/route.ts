import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import type { Customer } from '@/components/dashboard/customers/types';

const updateCustomerSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
  })
  .strict();

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
  const getCustomerStatus = () => {
    if (!customer.firstName || (!customer.email && !customer.phone)) {
      return 'Draft';
    }
    if (!customer.reviewRequests || customer.reviewRequests.length === 0) {
      return 'Ready';
    }

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
    if (customer.email && customer.phone) return 'email';
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

// GET /api/customers/[id] - Get single customer
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getBusinessContext();
    const businessId = context.businessId;
    const { id: customerId } = await params;

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: businessId,
        isActive: true,
      },
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
        reviewRequests: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            channel: true,
            sentAt: true,
            clickedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    const transformedCustomer = transformCustomerForFrontend(customer);

    return NextResponse.json({
      success: true,
      data: transformedCustomer,
    } satisfies ApiSuccessResponse<Customer>);
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customer' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// PUT /api/customers/[id] - Update customer
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getBusinessContext();
    const businessId = context.businessId;
    const { id: customerId } = await params;

    const body = await request.json();
    const customerData = updateCustomerSchema.parse(body);

    // Verify customer exists and belongs to business first
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: businessId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!existingCustomer) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    // Build update data - handle null and undefined properly
    const updateData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(customerData)) {
      // Include the field if it's explicitly provided (even if null)
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // Only proceed if there's data to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No data provided for update' },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    // Update customer with optimized query
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
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
        reviewRequests: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            channel: true,
            sentAt: true,
            clickedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const transformedCustomer = transformCustomerForFrontend(updatedCustomer);

    return NextResponse.json({
      success: true,
      data: transformedCustomer,
    } satisfies ApiSuccessResponse<Customer>);
  } catch (error) {
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

    console.error('Error updating customer:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      customerId,
      businessId,
      updateData: Object.keys(updateData || {}),
    });

    const errorMessage = error instanceof Error ? error.message : 'Failed to update customer';
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: errorMessage },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id] - Soft delete customer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getBusinessContext();
    const businessId = context.businessId;
    const { id: customerId } = await params;

    // Verify customer exists and belongs to business
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: businessId,
        isActive: true,
      },
    });

    if (!existingCustomer) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    // Soft delete customer
    await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    const response: ApiSuccessResponse<{ id: string; deleted: boolean }> = {
      success: true,
      data: { id: customerId, deleted: true },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete customer' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
