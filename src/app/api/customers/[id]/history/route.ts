import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';

interface HistoryEvent {
  id: string;
  type:
    | 'created'
    | 'updated'
    | 'request_sent'
    | 'request_scheduled'
    | 'request_delivered'
    | 'request_clicked'
    | 'request_failed'
    | 'opted_out';
  timestamp: string;
  description: string;
  metadata?: {
    channel?: 'sms' | 'email';
    status?: string;
    updatedBy?: string;
    requestId?: string;
    templateName?: string;
    error?: string;
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Debug logging for customer history API

  try {
    // Get business context using the same method as other working endpoints
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
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Await params before accessing properties (Next.js 15 requirement)
    const { id: customerId } = await params;

    // Verify customer belongs to business
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: { message: 'Customer not found' } },
        { status: 404 }
      );
    }

    // Fetch all related data
    const [reviewRequests, events, suppressions] = await Promise.all([
      // Get review requests for this customer
      prisma.reviewRequest.findMany({
        where: {
          customerId,
          businessId,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // Get events related to this customer's review requests
      prisma.event.findMany({
        where: {
          reviewRequest: {
            customerId,
            businessId,
          },
        },
        include: {
          reviewRequest: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),

      // Check if customer is suppressed
      prisma.suppression.findFirst({
        where: {
          businessId,
          OR: [{ contact: customer.email }, { contact: customer.phone }].filter(Boolean), // Remove null/empty contacts
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Data fetched for history compilation

    // Customer history data compiled successfully

    // Build history events
    const historyEvents: HistoryEvent[] = [];

    // Add customer creation event
    historyEvents.push({
      id: `created-${customer.id}`,
      type: 'created',
      timestamp: customer.createdAt.toISOString(),
      description: 'Customer record created',
      metadata: {
        updatedBy: 'System',
      },
    });

    // Add update event if customer was updated after creation
    if (customer.updatedAt > customer.createdAt) {
      historyEvents.push({
        id: `updated-${customer.id}`,
        type: 'updated',
        timestamp: customer.updatedAt.toISOString(),
        description: 'Customer information updated',
        metadata: {
          updatedBy: 'User',
        },
      });
    }

    // Add suppression event if exists
    if (suppressions) {
      historyEvents.push({
        id: `suppression-${suppressions.id}`,
        type: 'opted_out',
        timestamp: suppressions.createdAt.toISOString(),
        description: `Customer opted out (${suppressions.reason})`,
        metadata: {
          channel: suppressions.channel?.toLowerCase() as 'sms' | 'email' | undefined,
          status: 'suppressed',
        },
      });
    }

    // Add review request events - show ALL requests regardless of status
    for (const request of reviewRequests) {
      // Always add the creation event first
      historyEvents.push({
        id: `request-created-${request.id}`,
        type: 'request_scheduled',
        timestamp: request.createdAt.toISOString(),
        description: `Review request scheduled for ${request.channel.toLowerCase()}`,
        metadata: {
          channel: request.channel.toLowerCase() as 'sms' | 'email',
          requestId: request.id,
          templateName: request.templateId || 'Default Template',
          status: request.status.toLowerCase(),
        },
      });

      // Add sent event if request was sent
      if (
        (request.status === 'SENT' ||
          request.status === 'DELIVERED' ||
          request.status === 'CLICKED' ||
          request.status === 'COMPLETED') &&
        request.sentAt
      ) {
        historyEvents.push({
          id: `request-sent-${request.id}`,
          type: 'request_sent',
          timestamp: request.sentAt.toISOString(),
          description: `${request.channel === 'EMAIL' ? 'Email' : 'SMS'} successfully sent to customer`,
          metadata: {
            channel: request.channel.toLowerCase() as 'sms' | 'email',
            requestId: request.id,
            templateName: request.templateId || 'Default Template',
          },
        });
      }

      // Add delivered event
      if (request.deliveredAt) {
        historyEvents.push({
          id: `request-delivered-${request.id}`,
          type: 'request_delivered',
          timestamp: request.deliveredAt.toISOString(),
          description: `${request.channel === 'EMAIL' ? 'Email delivered to inbox' : 'SMS delivered to phone'}`,
          metadata: {
            channel: request.channel.toLowerCase() as 'sms' | 'email',
            requestId: request.id,
            status: 'delivered',
          },
        });
      }

      // Add clicked event
      if (request.clickedAt) {
        historyEvents.push({
          id: `request-clicked-${request.id}`,
          type: 'request_clicked',
          timestamp: request.clickedAt.toISOString(),
          description: `Customer clicked review link and visited review page`,
          metadata: {
            channel: request.channel.toLowerCase() as 'sms' | 'email',
            requestId: request.id,
            status: 'clicked',
          },
        });
      }

      // Add completed event
      if (request.completedAt) {
        historyEvents.push({
          id: `request-completed-${request.id}`,
          type: 'request_clicked',
          timestamp: request.completedAt.toISOString(),
          description: `Customer completed review submission`,
          metadata: {
            channel: request.channel.toLowerCase() as 'sms' | 'email',
            requestId: request.id,
            status: 'completed',
          },
        });
      }

      // Add failed/bounced event
      if (request.status === 'FAILED' || request.status === 'BOUNCED') {
        const failureReason =
          request.status === 'BOUNCED' ? 'bounced (invalid address)' : 'failed to send';
        historyEvents.push({
          id: `request-failed-${request.id}`,
          type: 'request_failed',
          timestamp: request.updatedAt.toISOString(),
          description: `${request.channel === 'EMAIL' ? 'Email' : 'SMS'} ${failureReason}`,
          metadata: {
            channel: request.channel.toLowerCase() as 'sms' | 'email',
            requestId: request.id,
            status: request.status.toLowerCase(),
            error: request.errorMessage,
          },
        });
      }

      // Add opted out event
      if (request.status === 'OPTED_OUT') {
        historyEvents.push({
          id: `request-optout-${request.id}`,
          type: 'opted_out',
          timestamp: request.updatedAt.toISOString(),
          description: `Customer opted out of future communications`,
          metadata: {
            channel: request.channel.toLowerCase() as 'sms' | 'email',
            requestId: request.id,
            status: 'opted_out',
          },
        });
      }
    }

    // Add detailed events (delivered, clicked, etc.)
    for (const event of events) {
      if (event.type === 'delivered') {
        historyEvents.push({
          id: `event-${event.id}`,
          type: 'request_delivered',
          timestamp: event.createdAt.toISOString(),
          description: `Review request delivered`,
          metadata: {
            channel: event.reviewRequest.channel.toLowerCase() as 'sms' | 'email',
            requestId: event.reviewRequestId,
            status: 'delivered',
          },
        });
      } else if (event.type === 'clicked') {
        historyEvents.push({
          id: `event-${event.id}`,
          type: 'request_clicked',
          timestamp: event.createdAt.toISOString(),
          description: `Customer clicked review link`,
          metadata: {
            channel: event.reviewRequest.channel.toLowerCase() as 'sms' | 'email',
            requestId: event.reviewRequestId,
            status: 'clicked',
          },
        });
      } else if (event.type === 'bounced' || event.type === 'failed') {
        historyEvents.push({
          id: `event-${event.id}`,
          type: 'request_failed',
          timestamp: event.createdAt.toISOString(),
          description: `Review request ${event.type}`,
          metadata: {
            channel: event.reviewRequest.channel.toLowerCase() as 'sms' | 'email',
            requestId: event.reviewRequestId,
            status: event.type,
          },
        });
      }
    }

    // Sort events by timestamp (newest first)
    historyEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // History events compiled: ${historyEvents.length} total events

    return NextResponse.json({
      success: true,
      events: historyEvents,
      debug: {
        customerId,
        businessId,
        reviewRequestsFound: reviewRequests.length,
        eventsFound: events.length,
        historyEventsCreated: historyEvents.length,
      },
      summary: {
        totalRequests: reviewRequests.length,
        sentRequests: reviewRequests.filter(r => r.status === 'SENT').length,
        failedRequests: reviewRequests.filter(r => r.status === 'FAILED').length,
        clickedRequests: events.filter(e => e.type === 'clicked').length,
        isSuppressed: !!suppressions,
      },
    });
  } catch (error) {
    console.error('Failed to fetch customer history:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to fetch customer history' },
      },
      { status: 500 }
    );
  }
}
