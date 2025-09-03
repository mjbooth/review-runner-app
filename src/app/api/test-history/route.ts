import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const customerId = '734939ee-1ab5-4cf5-b739-be485df35765';
  const businessId = '42e6491e-c57f-448e-8fd3-a45d0b649717';

  try {
    // Fetch all related data
    const [customer, reviewRequests, events, suppressions] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
      }),
      prisma.reviewRequest.findMany({
        where: {
          customerId,
          businessId,
        },
        orderBy: { createdAt: 'desc' },
      }),
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
      }),
      prisma.suppression.findFirst({
        where: {
          businessId,
          OR: [{ email: 'matt.j.booth@gmail.com' }, { phone: '07823337419' }],
        },
      }),
    ]);

    const historyEvents = [];

    // Add customer creation
    if (customer) {
      historyEvents.push({
        id: `created-${customer.id}`,
        type: 'created',
        timestamp: customer.createdAt.toISOString(),
        description: 'Customer record created',
      });
    }

    // Add all review request events
    for (const request of reviewRequests) {
      // Creation event
      historyEvents.push({
        id: `request-created-${request.id}`,
        type: 'request_scheduled',
        timestamp: request.createdAt.toISOString(),
        description: `Review request created (${request.status.toLowerCase()})`,
        metadata: {
          channel: request.channel.toLowerCase(),
          requestId: request.id,
          status: request.status.toLowerCase(),
        },
      });

      // Sent event
      if (request.sentAt) {
        historyEvents.push({
          id: `request-sent-${request.id}`,
          type: 'request_sent',
          timestamp: request.sentAt.toISOString(),
          description: `Review request sent via ${request.channel.toLowerCase()}`,
          metadata: {
            channel: request.channel.toLowerCase(),
            requestId: request.id,
          },
        });
      }

      // Delivered event
      if (request.deliveredAt) {
        historyEvents.push({
          id: `request-delivered-${request.id}`,
          type: 'request_delivered',
          timestamp: request.deliveredAt.toISOString(),
          description: 'Review request delivered',
          metadata: {
            channel: request.channel.toLowerCase(),
            requestId: request.id,
          },
        });
      }

      // Clicked event
      if (request.clickedAt) {
        historyEvents.push({
          id: `request-clicked-${request.id}`,
          type: 'request_clicked',
          timestamp: request.clickedAt.toISOString(),
          description: 'Customer clicked review link',
          metadata: {
            channel: request.channel.toLowerCase(),
            requestId: request.id,
          },
        });
      }
    }

    // Sort by timestamp
    historyEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      debug: {
        customerId,
        reviewRequestsCount: reviewRequests.length,
        eventsCount: events.length,
        reviewRequests: reviewRequests.map(r => ({
          id: r.id,
          status: r.status,
          channel: r.channel,
          createdAt: r.createdAt,
          sentAt: r.sentAt,
        })),
      },
      events: historyEvents,
    });
  } catch (error) {
    console.error('Test history error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
