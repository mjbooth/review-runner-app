import { reviewRequestService } from '../reviewRequestService';
import { MESSAGE_TEMPLATES } from '../../data/messageTemplates';
import type { Customer } from '../../types';
import type { MessageTemplate } from '../../data/messageTemplates';

// Mock fetch globally
global.fetch = jest.fn();

describe('reviewRequestService', () => {
  const mockCustomer: Customer = {
    id: 'customer-1',
    businessId: 'business-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+447123456789',
    source: 'MANUAL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTemplate: MessageTemplate = {
    id: 'template-1',
    name: 'Test Template',
    description: 'Test description',
    channel: 'SMS',
    subject: '',
    content: 'Hi {{firstName}}, please review us at {{reviewUrl}}',
    category: 'initial',
    tags: ['test'],
    characterCount: 50,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBusinessData = {
    id: 'business-1',
    googleReviewUrl: 'https://g.page/test-business/review',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockReset();
  });

  describe('createReviewRequests', () => {
    it('should successfully create review requests for immediate send', async () => {
      // Mock getCurrentBusiness response
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        // Mock createReviewRequests response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              requests: [
                {
                  id: 'request-1',
                  channel: 'SMS',
                  status: 'QUEUED',
                  reviewUrl: mockBusinessData.googleReviewUrl,
                  trackingUuid: 'uuid-1',
                  createdAt: new Date().toISOString(),
                  customer: mockCustomer,
                },
              ],
              totalRequests: 1,
              successfulRequests: 1,
              failedRequests: 0,
              errors: [],
            },
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Custom message content',
        '',
        undefined // Immediate send
      );

      expect(result).toEqual({
        requests: expect.arrayContaining([
          expect.objectContaining({
            id: 'request-1',
            channel: 'SMS',
            status: 'QUEUED',
          }),
        ]),
        totalRequests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        errors: [],
      });

      // Verify API calls
      expect(fetch).toHaveBeenCalledWith('/api/businesses/current', expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(
        '/api/review-requests',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            customerIds: ['customer-1'],
            channel: 'SMS',
            subject: '',
            messageContent: 'Custom message content',
            reviewUrl: mockBusinessData.googleReviewUrl,
            scheduledFor: undefined,
          }),
        })
      );
    });

    it('should successfully create review requests with scheduled send', async () => {
      const scheduledDate = new Date('2025-02-01T10:00:00Z');

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              requests: [
                {
                  id: 'request-1',
                  channel: 'SMS',
                  status: 'QUEUED',
                  scheduledFor: scheduledDate.toISOString(),
                  reviewUrl: mockBusinessData.googleReviewUrl,
                  trackingUuid: 'uuid-1',
                  createdAt: new Date().toISOString(),
                  customer: mockCustomer,
                },
              ],
              totalRequests: 1,
              successfulRequests: 1,
              failedRequests: 0,
              errors: [],
            },
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Custom message content',
        '',
        scheduledDate
      );

      expect(result.successfulRequests).toBe(1);
      expect(result.requests[0].scheduledFor).toBe(scheduledDate.toISOString());

      // Verify scheduled date is sent
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/review-requests',
        expect.objectContaining({
          body: expect.stringContaining(`"scheduledFor":"${scheduledDate.toISOString()}"`),
        })
      );
    });

    it('should handle bulk review requests', async () => {
      const customers = [
        mockCustomer,
        { ...mockCustomer, id: 'customer-2', email: 'jane.doe@example.com' },
        { ...mockCustomer, id: 'customer-3', email: 'bob.smith@example.com' },
      ];

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              requests: customers.map((c, i) => ({
                id: `request-${i + 1}`,
                channel: 'SMS',
                status: 'QUEUED',
                reviewUrl: mockBusinessData.googleReviewUrl,
                trackingUuid: `uuid-${i + 1}`,
                createdAt: new Date().toISOString(),
                customer: c,
              })),
              totalRequests: 3,
              successfulRequests: 3,
              failedRequests: 0,
              errors: [],
            },
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        customers,
        mockTemplate,
        'Custom message content',
        '',
        undefined
      );

      expect(result.totalRequests).toBe(3);
      expect(result.successfulRequests).toBe(3);
      expect(result.requests).toHaveLength(3);

      // Verify customer IDs are sent
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/review-requests',
        expect.objectContaining({
          body: expect.stringContaining('"customerIds":["customer-1","customer-2","customer-3"]'),
        })
      );
    });

    it('should handle email template with subject', async () => {
      const emailTemplate: MessageTemplate = {
        ...mockTemplate,
        channel: 'EMAIL',
        subject: 'Please review us',
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              requests: [
                {
                  id: 'request-1',
                  channel: 'EMAIL',
                  status: 'QUEUED',
                  subject: 'Custom subject',
                  reviewUrl: mockBusinessData.googleReviewUrl,
                  trackingUuid: 'uuid-1',
                  createdAt: new Date().toISOString(),
                  customer: mockCustomer,
                },
              ],
              totalRequests: 1,
              successfulRequests: 1,
              failedRequests: 0,
              errors: [],
            },
          }),
        });

      await reviewRequestService.createReviewRequests(
        [mockCustomer],
        emailTemplate,
        'Email content',
        'Custom subject',
        undefined
      );

      // Verify email subject is sent
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/review-requests',
        expect.objectContaining({
          body: expect.stringContaining('"subject":"Custom subject"'),
        })
      );
    });

    it('should use default review URL when business has none', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 'business-1' }, // No googleReviewUrl
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              requests: [
                {
                  id: 'request-1',
                  channel: 'SMS',
                  status: 'QUEUED',
                  reviewUrl: 'https://g.page/your-business/review',
                  trackingUuid: 'uuid-1',
                  createdAt: new Date().toISOString(),
                  customer: mockCustomer,
                },
              ],
              totalRequests: 1,
              successfulRequests: 1,
              failedRequests: 0,
              errors: [],
            },
          }),
        });

      await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Message content',
        '',
        undefined
      );

      // Verify default URL is used
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/review-requests',
        expect.objectContaining({
          body: expect.stringContaining('"reviewUrl":"https://g.page/your-business/review"'),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle suppressed contacts error', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            success: false,
            error: {
              code: 'SUPPRESSED_CONTACTS',
              message: 'Some contacts are suppressed',
            },
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Message content',
        '',
        undefined
      );

      expect(result).toEqual({
        requests: [],
        totalRequests: 1,
        successfulRequests: 0,
        failedRequests: 1,
        errors: [
          'Some contacts are suppressed and cannot receive messages. Please review your suppression list.',
        ],
      });
    });

    it('should handle invalid customers error', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            success: false,
            error: {
              code: 'INVALID_CUSTOMERS',
              message: 'Invalid customer IDs',
            },
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Message content',
        '',
        undefined
      );

      expect(result).toEqual({
        requests: [],
        totalRequests: 1,
        successfulRequests: 0,
        failedRequests: 1,
        errors: ['Some selected customers are invalid or not accessible.'],
      });
    });

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Message content',
        '',
        undefined
      );

      expect(result).toEqual({
        requests: [],
        totalRequests: 1,
        successfulRequests: 0,
        failedRequests: 1,
        errors: ['Review request creation failed: Network error'],
      });
    });

    it('should handle API error responses', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            error: {
              message: 'Internal server error',
            },
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Message content',
        '',
        undefined
      );

      expect(result.failedRequests).toBe(1);
      expect(result.errors[0]).toContain('Internal server error');
    });

    it('should handle malformed API responses', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: mockBusinessData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: false, // Success false without data
          }),
        });

      const result = await reviewRequestService.createReviewRequests(
        [mockCustomer],
        mockTemplate,
        'Message content',
        '',
        undefined
      );

      expect(result.failedRequests).toBe(1);
      expect(result.errors[0]).toContain('Failed to create review requests');
    });
  });

  describe('Other Methods', () => {
    it('should fetch review requests with filters', async () => {
      const mockRequests = [
        {
          id: 'request-1',
          channel: 'SMS',
          status: 'SENT',
          reviewUrl: 'https://example.com',
          trackingUuid: 'uuid-1',
          createdAt: new Date().toISOString(),
          customer: mockCustomer,
        },
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockRequests,
          meta: {
            pagination: {
              page: 1,
              limit: 20,
              totalCount: 1,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        }),
      });

      const result = await reviewRequestService.getReviewRequests({
        page: 1,
        limit: 20,
        status: 'SENT',
        channel: 'SMS',
      });

      expect(result.requests).toEqual(mockRequests);
      expect(result.pagination.totalCount).toBe(1);

      expect(fetch).toHaveBeenCalledWith(
        '/api/review-requests?page=1&limit=20&status=SENT&channel=SMS',
        expect.any(Object)
      );
    });

    it('should get scheduled requests', async () => {
      const scheduledRequests = [
        {
          id: 'request-1',
          channel: 'EMAIL',
          status: 'QUEUED',
          scheduledFor: '2025-02-01T10:00:00Z',
          reviewUrl: 'https://example.com',
          trackingUuid: 'uuid-1',
          createdAt: new Date().toISOString(),
          customer: mockCustomer,
        },
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            requests: scheduledRequests,
            pagination: {
              page: 1,
              limit: 20,
              totalCount: 1,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        }),
      });

      const result = await reviewRequestService.getScheduledRequests({
        page: 1,
        limit: 20,
        scheduledAfter: '2025-01-01T00:00:00Z',
      });

      expect(result.requests).toEqual(scheduledRequests);

      expect(fetch).toHaveBeenCalledWith(
        '/api/review-requests/scheduled?page=1&limit=20&scheduledAfter=2025-01-01T00%3A00%3A00Z',
        expect.any(Object)
      );
    });

    it('should cancel scheduled request', async () => {
      const mockCanceledRequest = {
        id: 'request-1',
        channel: 'SMS',
        status: 'CANCELLED',
        reviewUrl: 'https://example.com',
        trackingUuid: 'uuid-1',
        createdAt: new Date().toISOString(),
        customer: mockCustomer,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            request: mockCanceledRequest,
            action: 'cancel',
            message: 'Request cancelled successfully',
          },
        }),
      });

      const result = await reviewRequestService.cancelScheduledRequest('request-1');

      expect(result.action).toBe('cancel');
      expect(result.request.status).toBe('CANCELLED');

      expect(fetch).toHaveBeenCalledWith(
        '/api/review-requests/scheduled/request-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ action: 'cancel' }),
        })
      );
    });

    it('should reschedule request', async () => {
      const newScheduledDate = new Date('2025-02-15T14:00:00Z');
      const mockRescheduledRequest = {
        id: 'request-1',
        channel: 'SMS',
        status: 'QUEUED',
        scheduledFor: newScheduledDate.toISOString(),
        reviewUrl: 'https://example.com',
        trackingUuid: 'uuid-1',
        createdAt: new Date().toISOString(),
        customer: mockCustomer,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            request: mockRescheduledRequest,
            action: 'reschedule',
            message: 'Request rescheduled successfully',
          },
        }),
      });

      const result = await reviewRequestService.rescheduleRequest('request-1', newScheduledDate);

      expect(result.action).toBe('reschedule');
      expect(result.request.scheduledFor).toBe(newScheduledDate.toISOString());

      expect(fetch).toHaveBeenCalledWith(
        '/api/review-requests/scheduled/request-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            action: 'reschedule',
            scheduledFor: newScheduledDate.toISOString(),
          }),
        })
      );
    });

    it('should get request analytics', async () => {
      const mockAnalytics = {
        totalRequests: 100,
        statusBreakdown: [
          { status: 'SENT', count: 80, percentage: 80 },
          { status: 'CLICKED', count: 20, percentage: 20 },
        ],
        channelBreakdown: [
          { channel: 'SMS', count: 60 },
          { channel: 'EMAIL', count: 40 },
        ],
        dailyStats: [{ date: '2025-01-01', requests: 10, delivered: 8, clicked: 2 }],
        conversionRates: {
          deliveryRate: 90,
          clickRate: 25,
          completionRate: 15,
        },
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAnalytics,
        }),
      });

      const result = await reviewRequestService.getRequestAnalytics({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(result).toEqual(mockAnalytics);

      expect(fetch).toHaveBeenCalledWith(
        '/api/review-requests/analytics?startDate=2025-01-01&endDate=2025-01-31',
        expect.any(Object)
      );
    });
  });
});
