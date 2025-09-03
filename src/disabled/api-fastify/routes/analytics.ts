import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { ApiSuccessResponse, ApiErrorResponse } from '../../types/api';

const analyticsRoutes: FastifyPluginAsync = async function (fastify) {
  // Dashboard analytics
  const dashboardQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    period: z.enum(['7d', '30d', '90d']).default('30d'),
  });

  fastify.get('/dashboard', async (request, reply) => {
    try {
      const query = dashboardQuerySchema.parse(request.query);
      const { from, to, period } = query;

      // Calculate date range
      let startDate: Date;
      let endDate = new Date();

      if (from && to) {
        startDate = new Date(from);
        endDate = new Date(to);
      } else {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
      }

      const businessId = request.businessId!;

      // Get overall stats
      const [totalRequests, totalCustomers, recentActivity, channelStats, statusStats, dailyStats] =
        await Promise.all([
          // Total requests in period
          prisma.reviewRequest.count({
            where: {
              businessId,
              createdAt: { gte: startDate, lte: endDate },
              isActive: true,
            },
          }),

          // Total active customers
          prisma.customer.count({
            where: { businessId, isActive: true },
          }),

          // Recent activity
          prisma.reviewRequest.findMany({
            where: {
              businessId,
              createdAt: { gte: startDate, lte: endDate },
              isActive: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              status: true,
              channel: true,
              createdAt: true,
              customer: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          }),

          // Channel breakdown
          prisma.reviewRequest.groupBy({
            by: ['channel'],
            where: {
              businessId,
              createdAt: { gte: startDate, lte: endDate },
              isActive: true,
            },
            _count: true,
          }),

          // Status breakdown
          prisma.reviewRequest.groupBy({
            by: ['status'],
            where: {
              businessId,
              createdAt: { gte: startDate, lte: endDate },
              isActive: true,
            },
            _count: true,
          }),

          // Daily stats for chart
          prisma.$queryRaw`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
            SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
            SUM(CASE WHEN status = 'CLICKED' THEN 1 ELSE 0 END) as clicked,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
          FROM review_requests 
          WHERE business_id = ${businessId}
            AND created_at >= ${startDate}
            AND created_at <= ${endDate}
            AND is_active = true
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          LIMIT 30
        `,
        ]);

      // Calculate performance metrics
      const sentCount = statusStats.find(s => s.status === 'SENT')?._count || 0;
      const deliveredCount = statusStats.find(s => s.status === 'DELIVERED')?._count || 0;
      const clickedCount = statusStats.find(s => s.status === 'CLICKED')?._count || 0;
      const completedCount = statusStats.find(s => s.status === 'COMPLETED')?._count || 0;

      const deliveryRate = sentCount > 0 ? (deliveredCount / sentCount) * 100 : 0;
      const clickRate = deliveredCount > 0 ? (clickedCount / deliveredCount) * 100 : 0;
      const completionRate = clickedCount > 0 ? (completedCount / clickedCount) * 100 : 0;

      const analytics = {
        summary: {
          totalRequests,
          totalCustomers,
          deliveryRate: Math.round(deliveryRate * 100) / 100,
          clickRate: Math.round(clickRate * 100) / 100,
          completionRate: Math.round(completionRate * 100) / 100,
        },
        channels: channelStats.map(stat => ({
          channel: stat.channel,
          count: stat._count,
          percentage: totalRequests > 0 ? Math.round((stat._count / totalRequests) * 100) : 0,
        })),
        statuses: statusStats.map(stat => ({
          status: stat.status,
          count: stat._count,
          percentage: totalRequests > 0 ? Math.round((stat._count / totalRequests) * 100) : 0,
        })),
        dailyStats: dailyStats,
        recentActivity: recentActivity.map(req => ({
          id: req.id,
          customerName: `${req.customer.firstName} ${req.customer.lastName || ''}`.trim(),
          status: req.status,
          channel: req.channel,
          createdAt: req.createdAt,
        })),
        dateRange: {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
          period,
        },
      };

      const response: ApiSuccessResponse<typeof analytics> = {
        success: true,
        data: analytics,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });
};

export default analyticsRoutes;
