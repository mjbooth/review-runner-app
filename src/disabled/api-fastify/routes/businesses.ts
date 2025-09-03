import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { googlePlacesService } from '../../services/google-places';
import { logger } from '../../lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '../../types/api';

const businessRoutes: FastifyPluginAsync = async function (fastify) {
  // Get current business details
  fastify.get('/current', async (request, reply) => {
    try {
      const business = await prisma.business.findUnique({
        where: { id: request.businessId! },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          googleMapsUrl: true,
          googleRating: true,
          googleReviewCount: true,
          googleTypes: true,
          googlePhoneNumber: true,
          googleWebsite: true,
          googlePhotos: true,
          lastSyncedAt: true,
          timezone: true,
          smsCreditsUsed: true,
          smsCreditsLimit: true,
          emailCreditsUsed: true,
          emailCreditsLimit: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!business) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<typeof business> = {
        success: true,
        data: business,
      };

      return reply.send(response);
    } catch (error) {
      throw error;
    }
  });

  // Update business details
  const updateBusinessSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    website: z.string().url().optional(),
    googlePlaceId: z.string().optional(),
    googlePlaceName: z.string().optional(),
    googleReviewUrl: z.string().url().optional(),
    timezone: z.string().optional(),
  });

  fastify.put('/current', async (request, reply) => {
    try {
      const parsedData = updateBusinessSchema.parse(request.body);

      // Filter out undefined values for exactOptionalPropertyTypes compatibility
      const data = Object.fromEntries(
        Object.entries(parsedData).filter(([_, value]) => value !== undefined)
      );

      const business = await prisma.business.update({
        where: { id: request.businessId! },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          timezone: true,
          smsCreditsUsed: true,
          smsCreditsLimit: true,
          emailCreditsUsed: true,
          emailCreditsLimit: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const response: ApiSuccessResponse<typeof business> = {
        success: true,
        data: business,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Get business usage statistics
  fastify.get('/current/usage', async (request, reply) => {
    try {
      const business = await prisma.business.findUnique({
        where: { id: request.businessId! },
        select: {
          smsCreditsUsed: true,
          smsCreditsLimit: true,
          emailCreditsUsed: true,
          emailCreditsLimit: true,
        },
      });

      if (!business) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' },
        };
        return reply.code(404).send(response);
      }

      // Get current month usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyStats = await prisma.reviewRequest.groupBy({
        by: ['channel'],
        where: {
          businessId: request.businessId!,
          createdAt: { gte: startOfMonth },
          status: { in: ['SENT', 'DELIVERED', 'CLICKED', 'COMPLETED'] },
        },
        _count: true,
      });

      const smsThisMonth = monthlyStats.find(stat => stat.channel === 'SMS')?._count || 0;
      const emailThisMonth = monthlyStats.find(stat => stat.channel === 'EMAIL')?._count || 0;

      const usage = {
        sms: {
          used: business.smsCreditsUsed,
          limit: business.smsCreditsLimit,
          thisMonth: smsThisMonth,
          remaining: Math.max(0, business.smsCreditsLimit - business.smsCreditsUsed),
          percentageUsed: (business.smsCreditsUsed / business.smsCreditsLimit) * 100,
        },
        email: {
          used: business.emailCreditsUsed,
          limit: business.emailCreditsLimit,
          thisMonth: emailThisMonth,
          remaining: Math.max(0, business.emailCreditsLimit - business.emailCreditsUsed),
          percentageUsed: (business.emailCreditsUsed / business.emailCreditsLimit) * 100,
        },
      };

      const response: ApiSuccessResponse<typeof usage> = {
        success: true,
        data: usage,
      };

      return reply.send(response);
    } catch (error) {
      throw error;
    }
  });

  // Search Google Places
  const searchPlacesSchema = z.object({
    query: z.string().min(1).max(200),
  });

  fastify.post('/search-places', async (request, reply) => {
    try {
      const { query } = searchPlacesSchema.parse(request.body);

      logger.info('Searching places for business setup: ' + query + ' for business: ' + request.businessId);

      const places = await googlePlacesService.searchPlaces(query);

      const response: ApiSuccessResponse<typeof places> = {
        success: true,
        data: places,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Get place details from Google Places
  const getPlaceDetailsSchema = z.object({
    placeId: z.string().min(1),
  });

  fastify.post('/place-details', async (request, reply) => {
    try {
      const { placeId } = getPlaceDetailsSchema.parse(request.body);

      logger.info('Getting place details for business setup: ' + placeId + ' for business: ' + request.businessId);

      const placeDetails = await googlePlacesService.getPlaceDetails(placeId);

      if (!placeDetails) {
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'PLACE_NOT_FOUND', message: 'Place details not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<typeof placeDetails> = {
        success: true,
        data: placeDetails,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Connect business to Google Place using URL
  const connectPlaceSchema = z.object({
    googlePlaceUrl: z.string().url().min(1),
  });

  fastify.post('/connect-place', async (request, reply) => {
    try {
      const { googlePlaceUrl } = connectPlaceSchema.parse(request.body);

      logger.info('Connecting business to Google Place: ' + googlePlaceUrl + ' for business: ' + request.businessId);

      // Extract business details from Google Places URL
      const placeDetails = await googlePlacesService.getBusinessFromUrl(googlePlaceUrl);

      if (!placeDetails) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'PLACE_URL_INVALID',
            message: 'Could not extract business details from the provided URL',
          },
        };
        return reply.code(400).send(response);
      }

      // Generate Google Review URL
      const googleReviewUrl = googlePlacesService.generateReviewUrl(placeDetails.place_id);

      // Update business with Google Places information
      const updatedBusiness = await prisma.business.update({
        where: { id: request.businessId! },
        data: {
          name: placeDetails.name,
          address: placeDetails.formatted_address,
          phone: placeDetails.formatted_phone_number || null,
          website: placeDetails.website || null,
          googlePlaceId: placeDetails.place_id,
          googlePlaceName: placeDetails.name,
          googleReviewUrl,
          googleMapsUrl: placeDetails.url || googlePlaceUrl,
          googleRating: placeDetails.rating || null,
          googleReviewCount: placeDetails.user_ratings_total || null,
          googleTypes: placeDetails.types || [],
          googlePhoneNumber:
            placeDetails.international_phone_number || placeDetails.formatted_phone_number || null,
          googleWebsite: placeDetails.website || null,
          googlePhotos: placeDetails.photos
            ? JSON.parse(JSON.stringify(placeDetails.photos))
            : null,
          lastSyncedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          timezone: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info('Business connected to Google Place successfully: ' + placeDetails.name + ' (' + placeDetails.place_id + ') for business: ' + request.businessId);

      const response: ApiSuccessResponse<typeof updatedBusiness> = {
        success: true,
        data: updatedBusiness,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }

      logger.error('Error connecting business to Google Place for business: ' + request.businessId + ' - ' + (error instanceof Error ? error.message : String(error)));

      throw error;
    }
  });

  // Setup business profile (for onboarding)
  const setupBusinessSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.string().optional(),
    website: z.string().url().optional(),
    googlePlaceId: z.string().optional(),
    googlePlaceName: z.string().optional(),
    googleReviewUrl: z.string().url().optional(),
    timezone: z.string().default('Europe/London'),
  });

  fastify.post('/setup', async (request, reply) => {
    try {
      const parsedData = setupBusinessSchema.parse(request.body);

      // Filter out undefined values for exactOptionalPropertyTypes compatibility
      const data = Object.fromEntries(
        Object.entries(parsedData).filter(([_, value]) => value !== undefined)
      );

      logger.info('Setting up business profile: ' + data.name + ' for business: ' + request.businessId);

      // Check if business already exists
      const existingBusiness = await prisma.business.findUnique({
        where: { id: request.businessId! },
        select: { id: true, name: true },
      });

      let business;
      if (existingBusiness) {
        // Update existing business
        business = await prisma.business.update({
          where: { id: request.businessId! },
          data,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            website: true,
            googlePlaceId: true,
            googlePlaceName: true,
            googleReviewUrl: true,
            timezone: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        logger.info('Business profile updated: ' + data.name + ' for business: ' + request.businessId);
      } else {
        // This should not happen in normal flow, but handle gracefully
        const response: ApiErrorResponse = {
          success: false,
          error: { code: 'BUSINESS_NOT_FOUND', message: 'Business account not found' },
        };
        return reply.code(404).send(response);
      }

      const response: ApiSuccessResponse<typeof business> = {
        success: true,
        data: business,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }
      throw error;
    }
  });

  // Create initial business record (for new signups)
  const createBusinessSchema = z.object({
    clerkUserId: z.string().min(1),
    name: z.string().min(1).max(100),
    email: z.string().email(),
    timezone: z.string().default('Europe/London'),
  });

  fastify.post('/create', async (request, reply) => {
    try {
      const data = createBusinessSchema.parse(request.body);

      logger.info('Creating new business account: ' + data.name + ' for user: ' + data.clerkUserId);

      // Check if business already exists
      const existingBusiness = await prisma.business.findUnique({
        where: { clerkUserId: data.clerkUserId },
        select: { id: true, name: true },
      });

      if (existingBusiness) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'BUSINESS_EXISTS',
            message: 'Business account already exists for this user',
          },
        };
        return reply.code(409).send(response);
      }

      // Create new business
      const business = await prisma.business.create({
        data,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          timezone: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info('Business account created successfully: ' + data.name + ' (' + business.id + ') for user: ' + data.clerkUserId);

      const response: ApiSuccessResponse<typeof business> = {
        success: true,
        data: business,
      };

      return reply.code(201).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        };
        return reply.code(400).send(response);
      }

      logger.error('Error creating business account for user: ' + ((request.body as any)?.clerkUserId || 'unknown') + ' - ' + (error instanceof Error ? error.message : String(error)));

      throw error;
    }
  });

  // Refresh Google Places data for current business
  fastify.post('/refresh-google-data', async (request, reply) => {
    try {
      // Get current business
      const business = await prisma.business.findUnique({
        where: { id: request.businessId! },
        select: { id: true, googlePlaceId: true, name: true },
      });

      if (!business || !business.googlePlaceId) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'NO_GOOGLE_PLACE',
            message: 'Business is not connected to a Google Place',
          },
        };
        return reply.code(400).send(response);
      }

      logger.info('Refreshing Google Places data for business: ' + business.id + ' place: ' + business.googlePlaceId);

      // Get fresh place details from Google
      const placeDetails = await googlePlacesService.getPlaceDetails(business.googlePlaceId);

      if (!placeDetails) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'PLACE_NOT_FOUND',
            message: 'Could not fetch current place details from Google',
          },
        };
        return reply.code(404).send(response);
      }

      // Update business with fresh Google Places data
      const updatedBusiness = await prisma.business.update({
        where: { id: business.id },
        data: {
          googlePlaceName: placeDetails.name,
          googleRating: placeDetails.rating || null,
          googleReviewCount: placeDetails.user_ratings_total || null,
          googleTypes: placeDetails.types || [],
          googlePhoneNumber:
            placeDetails.international_phone_number || placeDetails.formatted_phone_number || null,
          googleWebsite: placeDetails.website || null,
          googlePhotos: placeDetails.photos
            ? JSON.parse(JSON.stringify(placeDetails.photos))
            : null,
          lastSyncedAt: new Date(),
          // Update business info if it has changed
          address: placeDetails.formatted_address,
          phone: placeDetails.formatted_phone_number || null,
          website: placeDetails.website || null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          googleMapsUrl: true,
          googleRating: true,
          googleReviewCount: true,
          googleTypes: true,
          googlePhoneNumber: true,
          googleWebsite: true,
          googlePhotos: true,
          lastSyncedAt: true,
          timezone: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info('Google Places data refreshed successfully for business: ' + business.id + ' place: ' + business.googlePlaceId + ' rating: ' + placeDetails.rating + ' reviews: ' + placeDetails.user_ratings_total);

      const response: ApiSuccessResponse<typeof updatedBusiness> = {
        success: true,
        data: updatedBusiness,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Error refreshing Google Places data for business: ' + request.businessId + ' - ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  });
};

export default businessRoutes;
