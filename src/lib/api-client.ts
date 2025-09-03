/**
 * API client for making requests to our Next.js API routes
 * Handles authentication, error handling, and response parsing
 */

import type { GooglePlace, GooglePlaceDetails } from '@/types/external';
import type { ApiResponse, ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// Base API configuration
const API_BASE = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '';

// Error classes
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Generic API request function
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const url = `${API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      // Try to parse error response
      try {
        const errorData: ApiErrorResponse = await response.json();
        throw new ApiError(
          errorData.error.message,
          errorData.error.code,
          response.status,
          errorData.error.details
        );
      } catch (parseError) {
        // If we can't parse the error response, throw a generic error
        throw new ApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR',
          response.status
        );
      }
    }

    const data: ApiResponse<T> = await response.json();

    if (!data.success) {
      throw new ApiError(data.error.message, data.error.code, response.status, data.error.details);
    }

    return data.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError('Network request failed. Please check your connection.', error);
    }

    throw new ApiError('An unexpected error occurred', 'UNKNOWN_ERROR', 500, error);
  }
}

// Google Places API functions
export const placesApi = {
  /**
   * Search for places using Google Places API
   */
  searchPlaces: async (query: string): Promise<GooglePlace[]> => {
    return apiRequest('/api/businesses/search-places', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  },

  /**
   * Get detailed information about a specific place
   */
  getPlaceDetails: async (placeId: string): Promise<GooglePlaceDetails> => {
    return apiRequest('/api/businesses/place-details', {
      method: 'POST',
      body: JSON.stringify({ placeId }),
    });
  },

  /**
   * Extract business information from Google Maps URL
   */
  extractFromUrl: async (googleMapsUrl: string): Promise<GooglePlaceDetails> => {
    return apiRequest('/api/businesses/connect-place', {
      method: 'POST',
      body: JSON.stringify({ googleMapsUrl }),
    });
  },
};

// Business setup API functions
export interface BusinessSetupData {
  // Google Places data
  placeId?: string;
  placeName?: string;
  placeAddress?: string;
  placePhone?: string;
  placeWebsite?: string;
  placeRating?: number;
  placeReviewCount?: number;
  placeTypes?: string[];
  placePhotos?: any[];
  googleMapsUrl?: string;

  // Business profile data
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  businessAddress: string;
  businessWebsite?: string;
  timezone?: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address: string;
  website?: string;
  googlePlaceId?: string;
  googlePlaceName?: string;
  googleReviewUrl?: string;
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const businessApi = {
  /**
   * Setup business profile from Google Place data
   */
  setupFromPlace: async (data: BusinessSetupData): Promise<BusinessProfile> => {
    return apiRequest('/api/businesses/setup-from-place', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Setup business profile manually (without Google Places)
   */
  setupManually: async (
    data: Omit<
      BusinessSetupData,
      | 'placeId'
      | 'placeName'
      | 'placeAddress'
      | 'placePhone'
      | 'placeWebsite'
      | 'placeRating'
      | 'placeReviewCount'
      | 'placeTypes'
      | 'placePhotos'
      | 'googleMapsUrl'
    >
  ): Promise<BusinessProfile> => {
    return apiRequest('/api/businesses/setup-manual', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Utility functions for error handling
export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};

export const isNetworkError = (error: unknown): error is NetworkError => {
  return error instanceof NetworkError;
};

export const getErrorMessage = (error: unknown): string => {
  if (isApiError(error)) {
    return error.message;
  }

  if (isNetworkError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
};
