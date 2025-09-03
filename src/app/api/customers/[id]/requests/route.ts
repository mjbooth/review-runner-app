import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({
      success: true,
      data: [],
      message: `Test for customer ${params.id}`,
    });

    // This is the original code - temporarily disabled for debugging
    /*
    const { businessId } = await getBusinessContext();
    const scope = createBusinessScope(businessId);

    const customerId = params.id;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const requestId = searchParams.get('requestId');

    // Build where clause
    let whereClause: any = {
      customerId,
    };

    // Add status filter if provided
    if (status) {
      whereClause.status = status;
    }

    // Add requestId filter if provided
    if (requestId) {
      whereClause.id = requestId;
    }

    // Fetch review requests for this customer using direct Prisma query
    // Add businessId to where clause for multi-tenant security
    whereClause.businessId = businessId;
    whereClause.isActive = true; // Only active requests
    
    const reviewRequests = await prisma.reviewRequest.findMany({
      where: whereClause,
      include: {
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
          },
        },
        events: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform the data to match our expected format
    const transformedRequests = reviewRequests.map(request => ({
      id: request.id,
      customerId: request.customerId,
      channel: request.channel,
      status: request.status,
      template: request.template?.name || 'default',
      templateType: 'initial', // Default since it's not in schema
      subject: request.subject,
      message: request.personalizedMessage || request.messageContent,
      sentAt: request.sentAt?.toISOString() || null,
      deliveredAt: request.deliveredAt?.toISOString() || null,
      clickedAt: request.clickedAt?.toISOString() || null,
      completedAt: request.completedAt?.toISOString() || null,
      scheduledFor: request.scheduledFor?.toISOString() || null,
      trackingUrl: request.trackingUrl,
      messageId: request.externalId,
      cost: 0, // Not in schema, default to 0
      metadata: {
        twilioMessageSid: request.externalId,
        sendgridMessageId: request.externalId,
        deliveryAttempts: request.retryCount || 0,
        lastDeliveryAttempt: request.updatedAt?.toISOString(),
        errorDetails: request.errorMessage,
        clickCount: 0, // Not in schema
        businessInfo: {
          name: request.customer?.firstName + ' ' + request.customer?.lastName,
          googlePlaceId: null,
          reviewUrl: request.reviewUrl,
        },
      },
      events: request.events?.map(event => ({
        id: event.id,
        type: event.type.toLowerCase(),
        timestamp: event.createdAt.toISOString(),
        details: event.description,
        metadata: event.metadata || {},
      })) || [],
    }));

    logger.info(`Fetched customer requests: ${transformedRequests.length} requests for customer ${customerId}`);

    return NextResponse.json({
      success: true,
      data: transformedRequests,
    } satisfies ApiSuccessResponse<any>);
    */
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Test endpoint error',
      },
      { status: 500 }
    );
  }
}
