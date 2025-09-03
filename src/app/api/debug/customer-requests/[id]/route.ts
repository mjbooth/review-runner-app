import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const customerId = params.id;

    logger.info('Debug: Fetching requests for customer', { customerId });

    // First, let's check if the customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        businessId: true,
      },
    });

    if (!customer) {
      return NextResponse.json({
        success: false,
        error: 'Customer not found',
        debug: { customerId },
      });
    }

    logger.info('Debug: Customer found', { customer });

    // Now let's try to fetch review requests
    const reviewRequests = await prisma.reviewRequest.findMany({
      where: {
        customerId: customerId,
      },
      select: {
        id: true,
        status: true,
        channel: true,
        scheduledFor: true,
        createdAt: true,
      },
      take: 5, // Limit to first 5
    });

    logger.info('Debug: Review requests found', {
      count: reviewRequests.length,
      requests: reviewRequests,
    });

    return NextResponse.json({
      success: true,
      debug: {
        customer,
        reviewRequests,
        customerId,
      },
    });
  } catch (error) {
    logger.error('Debug endpoint error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      customerId: params.id,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
