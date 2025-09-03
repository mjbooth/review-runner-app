import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import { z } from 'zod';

const analyticsQuerySchema = z.object({
  days: z.string().optional().default('30').transform(val => parseInt(val, 10)),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    // Get business from auth
    const businessContext = await getBusinessContext();
    const businessId = businessContext.businessId;

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryResult = analyticsQuerySchema.safeParse({
      days: searchParams.get('days'),
      channel: searchParams.get('channel'),
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: queryResult.error.flatten() } 
        },
        { status: 400 }
      );
    }

    const { days, channel } = queryResult.data;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build where clause for filtering
    const whereClause: any = {
      businessId: businessId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (channel) {
      whereClause.channel = channel;
    }

    // Get total review requests sent
    const totalSent = await prisma.reviewRequest.count({
      where: {
        ...whereClause,
        status: { in: ['SENT', 'DELIVERED', 'CLICKED', 'COMPLETED'] },
      },
    });

    // Get clicked review requests
    const totalClicked = await prisma.reviewRequest.count({
      where: {
        ...whereClause,
        clickedAt: { not: null },
      },
    });

    // Get daily breakdown
    const dailyStats = await prisma.$queryRaw`
      SELECT 
        DATE(created_at AT TIME ZONE 'UTC') as date,
        COUNT(CASE WHEN status IN ('SENT', 'DELIVERED', 'CLICKED', 'COMPLETED') THEN 1 END)::int as sent,
        COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END)::int as clicked
      FROM review_requests 
      WHERE business_id = ${businessId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
        ${channel ? `AND channel = '${channel}'` : ''}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date DESC
      LIMIT 30
    ` as Array<{ date: Date; sent: number; clicked: number }>;

    // Calculate click-through rate
    const clickThroughRate = totalSent > 0 ? ((totalClicked / totalSent) * 100) : 0;

    // Get channel breakdown
    const channelStats = await prisma.reviewRequest.groupBy({
      by: ['channel'],
      where: {
        businessId: businessId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        clickedAt: true,
      },
    });

    const channelBreakdown = channelStats.map(stat => ({
      channel: stat.channel,
      totalSent: stat._count.id,
      totalClicked: stat._sum.clickedAt || 0,
      clickThroughRate: stat._count.id > 0 ? ((stat._sum.clickedAt || 0) / stat._count.id * 100) : 0,
    }));

    // Format daily stats with click-through rates
    const formattedDailyStats = dailyStats.map(day => ({
      date: day.date.toISOString().split('T')[0],
      sent: day.sent,
      clicked: day.clicked,
      clickThroughRate: day.sent > 0 ? ((day.clicked / day.sent) * 100) : 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalSent,
          totalClicked,
          clickThroughRate: Math.round(clickThroughRate * 100) / 100, // Round to 2 decimal places
        },
        dailyStats: formattedDailyStats,
        channelBreakdown,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days,
        },
      },
    });

  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Failed to fetch click-through rate analytics',
        } 
      },
      { status: 500 }
    );
  }
}