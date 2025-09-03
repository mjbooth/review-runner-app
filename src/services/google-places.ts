import { logger } from '../lib/logger';
import type {
  GooglePlace,
  GooglePlaceDetails,
  GooglePlacesSearchResponse,
  GooglePlaceDetailsResponse,
} from '../types/external';

interface GooglePlacesService {
  searchPlaces: (query: string) => Promise<GooglePlace[]>;
  getPlaceDetails: (placeId: string) => Promise<GooglePlaceDetails | null>;
  extractPlaceIdFromUrl: (url: string) => string | null;
  getBusinessFromUrl: (url: string) => Promise<GooglePlaceDetails | null>;
  generateReviewUrl: (placeId: string) => string;
}

class GooglePlacesServiceImpl implements GooglePlacesService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('Google Places API key not configured');
    }
  }

  /**
   * Search for places using text query (New Places API)
   */
  async searchPlaces(query: string): Promise<GooglePlace[]> {
    if (!this.apiKey) {
      logger.error('Google Places API key not configured');
      return [];
    }

    try {
      logger.info('Searching places with New Places API', { query });

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.location,places.photos',
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 10,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Google Places search failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        return [];
      }

      const data = await response.json();

      if (!data.places || !Array.isArray(data.places)) {
        logger.warn('No places returned from search', { query, data });
        return [];
      }

      const places: GooglePlace[] = data.places.map((place: any) => ({
        place_id: place.id,
        name: place.displayName?.text || place.displayName || '',
        formatted_address: place.formattedAddress || '',
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        types: place.types || [],
        geometry: {
          location: {
            lat: place.location?.latitude || 0,
            lng: place.location?.longitude || 0,
          },
        },
        photos:
          place.photos?.map((photo: any) => ({
            photo_reference: photo.name,
            height: photo.height || 0,
            width: photo.width || 0,
          })) || [],
      }));

      logger.info('Places search completed', {
        query,
        resultsCount: places.length,
      });

      return places;
    } catch (error) {
      logger.error('Google Places search error', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get detailed information about a place (New Places API)
   */
  async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails | null> {
    if (!this.apiKey) {
      logger.error(
        'Google Places API key not configured - please set GOOGLE_PLACES_API_KEY environment variable'
      );
      return null;
    }

    try {
      logger.info('Fetching place details with New Places API', {
        placeId,
        hasApiKey: !!this.apiKey,
        apiKeyPrefix: this.apiKey.substring(0, 8) + '...',
      });

      const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,types,location,photos,reviews',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorDetails = {
          placeId,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          hasApiKey: !!this.apiKey,
          apiKeyLength: this.apiKey?.length || 0,
          headers: Object.fromEntries(response.headers.entries()),
        };

        logger.error('Google Places details failed', errorDetails);
        console.error('Google Places API Error:', errorDetails);
        return null;
      }

      const place = await response.json();

      const placeDetails: GooglePlaceDetails = {
        place_id: place.id || placeId,
        name: place.displayName?.text || place.displayName || '',
        formatted_address: place.formattedAddress || '',
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        types: place.types || [],
        geometry: {
          location: {
            lat: place.location?.latitude || 0,
            lng: place.location?.longitude || 0,
          },
        },
        formatted_phone_number: place.nationalPhoneNumber,
        international_phone_number: place.internationalPhoneNumber,
        website: place.websiteUri,
        url: place.googleMapsUri,
        photos:
          place.photos?.map((photo: any) => ({
            photo_reference: photo.name,
            height: photo.height || 0,
            width: photo.width || 0,
          })) || [],
        reviews:
          place.reviews?.map((review: any) => ({
            author_name: review.authorAttribution?.displayName || '',
            rating: review.rating || 0,
            text: review.text?.text || '',
            time: review.publishTime ? new Date(review.publishTime).getTime() / 1000 : 0,
            author_url: review.authorAttribution?.uri,
            profile_photo_url: review.authorAttribution?.photoUri,
          })) || [],
      };

      logger.info('Place details fetched successfully', {
        placeId,
        name: placeDetails.name,
      });

      return placeDetails;
    } catch (error) {
      const errorDetails = {
        placeId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: typeof error,
        hasApiKey: !!this.apiKey,
        apiKeyLength: this.apiKey?.length || 0,
      };

      logger.error('Google Places details error', errorDetails);
      console.error('Google Places Exception:', errorDetails);
      return null;
    }
  }

  /**
   * Extract place ID from various Google Maps URL formats
   */
  extractPlaceIdFromUrl(url: string): string | null {
    try {
      // Handle different Google Maps URL formats
      const patterns = [
        // Direct place ID parameter (most reliable)
        /[?&]place_id=(ChIJ[A-Za-z0-9_-]+)/,
        // Modern Google Maps place URL with place ID in data parameter
        /maps\.google\.com.*[?&]place_id=(ChIJ[A-Za-z0-9_-]+)/,
        // Google Maps data parameter format: !1s<place_id> (only ChIJ format)
        /maps\.google\.com.*data=.*!1s(ChIJ[A-Za-z0-9_-]{15,})/,
        // More specific data parameter with place info (only ChIJ format)
        /maps\.google\.com.*data=.*!3m4!1s(ChIJ[A-Za-z0-9_-]{15,})/,
        /maps\.google\.com.*data=.*!4m5!3m4!1s(ChIJ[A-Za-z0-9_-]{15,})/,
        // Maps URL with /place/ path and data (only ChIJ format)
        /maps\.google\.com\/maps.*\/place\/[^/]*\/.*@.*\/data=.*!1s(ChIJ[A-Za-z0-9_-]{15,})/,
        // Google Maps with CID (Customer ID) format - kept for identification but not use
        /maps\.google\.com.*[?&]cid=(\d+)/,
      ];

      logger.info('Attempting to extract place ID from URL', {
        fullUrl: url,
        urlLength: url.length,
        domain: url.includes('google.com') ? 'google.com' : 'other',
      });

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = url.match(pattern);

        logger.debug('Testing pattern', {
          patternIndex: i,
          pattern: pattern.toString(),
          matched: !!match,
          groups: match ? match.length : 0,
          matchedText: match ? match[0] : null,
          extractedId: match && match[1] ? match[1] : null,
        });

        if (match && match[1]) {
          const identifier = match[1];

          logger.info('Pattern matched, extracted identifier', {
            patternIndex: i,
            identifier,
            identifierLength: identifier.length,
            startsWithChIJ: identifier.startsWith('ChIJ'),
            isNumeric: /^\d+$/.test(identifier),
          });

          // Validate that this looks like a proper place ID
          // Most Google Places IDs start with "ChIJ" and are 20+ characters long
          if (identifier.startsWith('ChIJ') && identifier.length >= 20) {
            logger.info('Successfully extracted valid place ID from URL', {
              url: url.substring(0, 100) + '...',
              placeId: identifier,
              pattern: pattern.toString(),
            });
            return identifier;
          } else if (/^\d+$/.test(identifier)) {
            // This is likely a CID, log it but we can't use it directly
            logger.warn('Extracted CID instead of place ID', {
              url: url.substring(0, 100) + '...',
              cid: identifier,
            });
          } else {
            // Invalid place ID format
            logger.warn('Extracted invalid place ID format', {
              url: url.substring(0, 100) + '...',
              invalidId: identifier,
              expectedFormat: 'ChIJ...',
              patternIndex: i,
            });
          }
        }
      }

      // Try to extract from URL path if patterns failed
      const urlObj = new URL(url);
      const pathMatch = urlObj.pathname.match(/\/place\/([^/]+)/);
      if (pathMatch) {
        const placeName = decodeURIComponent(pathMatch[1]);
        logger.info('Extracted place name from URL path', {
          placeName,
          url: url.substring(0, 100) + '...',
        });

        // We could search for this place by name, but for now return null
        // and let the user know to use a direct Google Maps URL
      }

      logger.warn('Could not extract place ID from URL', {
        url: url.substring(0, 150) + '...',
        suggestions: 'Try using the "Share" button from Google Maps to get a direct URL',
      });

      return null;
    } catch (error) {
      logger.error('Error extracting place ID from URL', {
        url: url.substring(0, 100) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Resolve shortened Google Maps URLs by following redirects
   */
  async resolveShortUrl(url: string): Promise<string> {
    try {
      logger.info('Attempting to resolve shortened URL', { url });

      const response = await fetch(url, {
        method: 'HEAD', // Just get headers, not body
        redirect: 'manual', // Don't follow redirects automatically
      });

      const location = response.headers.get('location');
      if (location) {
        logger.info('URL redirect found', {
          originalUrl: url,
          redirectUrl: location.substring(0, 150) + '...',
        });
        return location;
      }

      // If no redirect, return original URL
      return url;
    } catch (error) {
      logger.warn('Failed to resolve shortened URL', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return url; // Return original URL if resolution fails
    }
  }

  /**
   * Get business details from Google Maps/Places URL
   */
  async getBusinessFromUrl(url: string): Promise<GooglePlaceDetails | null> {
    try {
      let workingUrl = url;

      // Check if this is a shortened URL (goo.gl, maps.app.goo.gl)
      if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
        logger.info('Detected shortened URL, resolving...', { url });
        workingUrl = await this.resolveShortUrl(url);
      }

      const placeId = this.extractPlaceIdFromUrl(workingUrl);

      if (placeId) {
        // If it's a CID, we need to search first to get the place_id
        if (/^\d+$/.test(placeId)) {
          logger.info('CID detected, cannot use directly with Places API', { cid: placeId });
          return null;
        }

        // Try to get place details with the extracted place ID
        const placeDetails = await this.getPlaceDetails(placeId);
        if (placeDetails) {
          return placeDetails;
        }
      }

      // If place ID extraction failed or place details failed,
      // try to extract business name and search for it
      try {
        const urlObj = new URL(workingUrl);
        const pathMatch = urlObj.pathname.match(/\/place\/([^/]+)/);

        if (pathMatch) {
          const placeName = decodeURIComponent(pathMatch[1].replace(/\+/g, ' '));
          logger.info('Attempting to search for business by name', {
            placeName,
            originalUrl: url.substring(0, 100) + '...',
            resolvedUrl: workingUrl.substring(0, 100) + '...',
          });

          // Search for the place by name
          const searchResults = await this.searchPlaces(placeName);
          if (searchResults && searchResults.length > 0) {
            // Get details for the first result
            const topResult = searchResults[0];
            logger.info('Found business via search', {
              placeName,
              foundName: topResult.name,
              placeId: topResult.place_id,
            });

            return await this.getPlaceDetails(topResult.place_id);
          }
        }
      } catch (searchError) {
        logger.warn('Failed to search for business by name', {
          error: searchError instanceof Error ? searchError.message : String(searchError),
        });
      }

      return null;
    } catch (error) {
      logger.error('Error getting business from URL', {
        url: url.substring(0, 100) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Generate Google Review URL for a place
   */
  generateReviewUrl(placeId: string): string {
    return `https://search.google.com/local/writereview?placeid=${placeId}`;
  }

  /**
   * Validate API key and connection (New Places API)
   */
  async validateConnection(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Try a simple place details request with a well-known place ID
      const testPlaceId = 'ChIJN1t_tDeuEmsRUsoyG83frY4'; // Google Sydney office

      const response = await fetch(`https://places.googleapis.com/v1/places/${testPlaceId}`, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'id,displayName',
        },
      });

      const isValid = response.ok;
      logger.info('Google Places API validation', { isValid, status: response.status });

      return isValid;
    } catch (error) {
      logger.error('Google Places API validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Export singleton instance
export const googlePlacesService: GooglePlacesService = new GooglePlacesServiceImpl();

// Export types and service for testing
export type { GooglePlacesService };
export { GooglePlacesServiceImpl };
