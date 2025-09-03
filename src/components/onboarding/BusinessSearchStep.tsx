'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Search, MapPin, ExternalLink, Loader2 } from '@/components/ui/icons';
import { useUser } from '@clerk/nextjs';
import { SearchMethodToggle, type SearchMethod } from './SearchMethodToggle';
import { BusinessPreviewCard, type BusinessData } from './BusinessPreviewCard';
import { ErrorState, type BusinessError, RecoveryState } from './ErrorStates';
import { ManualBusinessEntry, ManualEntryPrompt } from './ManualBusinessEntry';
import {
  placesApi,
  businessApi,
  isApiError,
  isNetworkError,
  getErrorMessage,
} from '@/lib/api-client';
import type { BusinessSetupData } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// Extend BusinessData for compatibility
interface BusinessInfo extends BusinessData {}

interface BusinessSearchStepProps {
  onBusinessSelect?: (business: BusinessInfo) => void;
  onBusinessCreated?: (businessId: string) => void;
  initialSearchMethod?: SearchMethod;
  className?: string;
}

export function BusinessSearchStep({
  onBusinessSelect,
  onBusinessCreated,
  initialSearchMethod = 'search',
  className,
}: BusinessSearchStepProps) {
  const { user } = useUser();
  const [searchMethod, setSearchMethod] = useState<SearchMethod>(initialSearchMethod);
  const [searchQuery, setSearchQuery] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const [searchResults, setSearchResults] = useState<BusinessInfo[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessInfo | null>(null);
  const [businessPreview, setBusinessPreview] = useState<BusinessData | null>(null);
  const [isBusinessConfirmed, setIsBusinessConfirmed] = useState(false);
  const [currentError, setCurrentError] = useState<BusinessError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [errors, setErrors] = useState<{
    search?: string;
    url?: string;
    general?: string;
  }>({});
  const debounceRef = useRef<NodeJS.Timeout>();

  // Validate Google Maps URL format
  const validateGoogleMapsUrl = (url: string): boolean => {
    if (!url.trim()) return false;

    const googleMapsPatterns = [
      /^https:\/\/(www\.)?google\.com\/maps/,
      /^https:\/\/(www\.)?google\.[a-z]{2,4}\/maps/,
      /^https:\/\/maps\.google\.com/,
      /^https:\/\/goo\.gl\/maps/,
    ];

    return googleMapsPatterns.some(pattern => pattern.test(url));
  };

  // Real Google Places search function
  const performSearch = useCallback(async (query: string, isRetry: boolean = false) => {
    if (!query.trim()) return [];

    setIsLoading(true);
    setErrors({});
    setCurrentError(null);

    if (isRetry) {
      setIsRetrying(true);
      setRetryCount(prev => prev + 1);
    }

    try {
      // Call the real Google Places API
      const places = await placesApi.searchPlaces(query);

      // Convert Google Places data to BusinessInfo format
      const businessResults: BusinessInfo[] = places.map(place => ({
        id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        placeId: place.place_id,
        phone: undefined, // Basic search doesn't include phone
        website: undefined, // Basic search doesn't include website
        rating: place.rating,
        reviewCount: place.user_ratings_total,
      }));

      if (businessResults.length === 0) {
        setCurrentError({
          type: 'business-not-found',
          message: `No businesses found matching "${query}"`,
          details: 'Try adjusting your search terms or using a Google Maps URL instead.',
          canRetry: true,
        });
      } else {
        setSearchResults(businessResults);
        setRetryCount(0); // Reset retry count on success
      }
    } catch (error) {
      let errorType: BusinessError['type'] = 'search-failed';
      let message = 'Search failed unexpectedly';
      let details = 'An error occurred while searching for businesses.';

      if (isNetworkError(error)) {
        errorType = 'network-error';
        message = 'Unable to connect to the search service';
        details = 'Please check your internet connection and try again.';
      } else if (isApiError(error)) {
        if (error.code === 'UNAUTHORIZED') {
          errorType = 'general-error';
          message = 'Authentication error';
          details = 'Please refresh the page and try again.';
        } else if (error.status >= 500) {
          errorType = 'google-places-unavailable';
          message = 'Google Places service is temporarily unavailable';
          details = 'This is usually a temporary issue. Please try again in a moment.';
        } else {
          message = error.message;
          details = typeof error.details === 'string' ? error.details : details;
        }
      }

      setCurrentError({
        type: errorType,
        message,
        details,
        canRetry: true,
      });

      setSearchResults([]);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, []);

  // Handle search input change with proper debouncing
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setErrors({});

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length >= 2) {
      // Debounce search with proper cleanup
      debounceRef.current = setTimeout(() => {
        performSearch(value);
      }, 500);
    } else {
      setSearchResults([]);
      setCurrentError(null);
    }
  };

  // Handle Google Maps URL validation and extraction
  const handleUrlChange = (value: string) => {
    setGoogleMapsUrl(value);
    setErrors({});
    setCurrentError(null);

    if (value.trim() && !validateGoogleMapsUrl(value)) {
      setCurrentError({
        type: 'invalid-url',
        message: 'Invalid Google Maps URL format',
        details: "Please make sure you're using a valid Google Maps business URL.",
        canRetry: false,
      });
    }
  };

  // Get detailed business information from Google Places API
  const fetchBusinessDetails = async (business: BusinessInfo): Promise<BusinessData> => {
    setIsLoadingPreview(true);
    setCurrentError(null);

    try {
      // Call the real Google Places API for details
      const placeDetails = await placesApi.getPlaceDetails(business.placeId!);

      // Convert Google Places data to BusinessData format
      const detailedBusiness: BusinessData = {
        ...business,
        name: placeDetails.name,
        address: placeDetails.formatted_address,
        phone: placeDetails.formatted_phone_number,
        website: placeDetails.website,
        rating: placeDetails.rating,
        reviewCount: placeDetails.user_ratings_total,
        businessHours: placeDetails.opening_hours?.weekday_text || undefined,
        categories: placeDetails.types || undefined,
        photoUrl: placeDetails.photos?.[0]?.photo_reference
          ? `/api/places/photo?photoName=${placeDetails.photos[0].photo_reference}&maxWidthPx=400`
          : undefined,
        placeId: placeDetails.place_id,
        googleMapsUrl: placeDetails.url,
      };

      return detailedBusiness;
    } catch (error) {
      let errorType: BusinessError['type'] = 'general-error';
      let message = 'Failed to load business details';
      let details = 'Unable to fetch additional business information from Google Places.';

      if (isNetworkError(error)) {
        errorType = 'network-error';
        message = 'Unable to connect to Google Places';
        details = 'Please check your internet connection and try again.';
      } else if (isApiError(error)) {
        if (error.status >= 500) {
          errorType = 'google-places-unavailable';
          message = 'Google Places service is temporarily unavailable';
          details = 'This is usually a temporary issue. Please try again in a moment.';
        } else {
          message = error.message;
          details = typeof error.details === 'string' ? error.details : details;
        }
      }

      setCurrentError({
        type: errorType,
        message,
        details,
        canRetry: true,
      });
      throw error;
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle business selection from search results
  const handleBusinessSelect = async (business: BusinessInfo) => {
    setSelectedBusiness(business);
    setSearchResults([]); // Clear search results
    setCurrentError(null);

    try {
      // Fetch detailed business information
      const detailedBusiness = await fetchBusinessDetails(business);
      setBusinessPreview(detailedBusiness);
      setIsBusinessConfirmed(false);
    } catch (error) {
      // Error is already set in fetchBusinessDetails
      console.error('Failed to fetch business details:', error);
    }
  };

  // Handle business confirmation and creation
  const handleBusinessConfirm = async (confirmed: boolean) => {
    setIsBusinessConfirmed(confirmed);

    if (confirmed && businessPreview) {
      // First notify parent that business is selected
      onBusinessSelect?.(businessPreview);

      // Then create the business profile
      setIsCreatingBusiness(true);
      setCurrentError(null);

      try {
        // Prepare business setup data
        const userEmail =
          user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress;

        if (!userEmail) {
          throw new Error('User email not available');
        }

        const setupData: BusinessSetupData = {
          // Business profile data
          businessName: businessPreview.name,
          businessEmail: userEmail,
          businessPhone: businessPreview.phone,
          businessAddress: businessPreview.address,
          businessWebsite: businessPreview.website,
          timezone: 'Europe/London',
        };

        // Add Google Places data if available
        if (businessPreview.placeId) {
          setupData.placeId = businessPreview.placeId;
          setupData.placeName = businessPreview.name;
          setupData.placeAddress = businessPreview.address;
          setupData.placePhone = businessPreview.phone;
          setupData.placeWebsite = businessPreview.website;
          setupData.placeRating = businessPreview.rating;
          setupData.placeReviewCount = businessPreview.reviewCount;
          setupData.placeTypes = businessPreview.categories || [];
          setupData.googleMapsUrl = businessPreview.googleMapsUrl;
        }

        // Create business profile
        const createdBusiness = businessPreview.placeId
          ? await businessApi.setupFromPlace(setupData)
          : await businessApi.setupManually(setupData);

        // Notify parent that business was created
        onBusinessCreated?.(createdBusiness.id);
      } catch (error) {
        let errorType: BusinessError['type'] = 'general-error';
        let message = 'Failed to create business profile';
        let details = 'There was an error setting up your business profile.';

        if (error instanceof Error && error.message === 'User email not available') {
          message = 'User email required';
          details = 'Please make sure you have a verified email address in your account.';
        } else if (isNetworkError(error)) {
          errorType = 'network-error';
          message = 'Unable to connect to the server';
          details = 'Please check your internet connection and try again.';
        } else if (isApiError(error)) {
          if (error.code === 'BUSINESS_EXISTS') {
            message = 'Business profile already exists';
            details = 'A business profile has already been created for your account.';
          } else if (error.code === 'VALIDATION_ERROR') {
            message = 'Invalid business information';
            details = 'Please check that all required fields are filled out correctly.';
          } else {
            message = error.message;
            details = typeof error.details === 'string' ? error.details : details;
          }
        }

        setCurrentError({
          type: errorType,
          message,
          details,
          canRetry: true,
        });

        // Reset confirmation state on error
        setIsBusinessConfirmed(false);
      } finally {
        setIsCreatingBusiness(false);
      }
    }
  };

  // Handle business update from editing
  const handleBusinessUpdate = (updatedBusiness: BusinessData) => {
    setBusinessPreview(updatedBusiness);
    if (isBusinessConfirmed) {
      onBusinessSelect?.(updatedBusiness);
    }
  };

  // Handle URL submission
  const handleUrlSubmit = async () => {
    if (!googleMapsUrl.trim()) {
      setCurrentError({
        type: 'invalid-url',
        message: 'Google Maps URL is required',
        details: 'Please enter a valid Google Maps business URL.',
        canRetry: false,
      });
      return;
    }

    if (!validateGoogleMapsUrl(googleMapsUrl)) {
      setCurrentError({
        type: 'invalid-url',
        message: 'Invalid Google Maps URL format',
        details: "Please make sure you're using a valid Google Maps business URL.",
        canRetry: false,
      });
      return;
    }

    setIsLoading(true);
    setCurrentError(null);

    try {
      // Call the real Google Places API to extract business info from URL
      const placeDetails = await placesApi.extractFromUrl(googleMapsUrl);

      // Convert Google Places data to BusinessInfo format
      const businessFromUrl: BusinessInfo = {
        id: placeDetails.place_id,
        name: placeDetails.name,
        address: placeDetails.formatted_address,
        phone: placeDetails.formatted_phone_number,
        website: placeDetails.website,
        rating: placeDetails.rating,
        reviewCount: placeDetails.user_ratings_total,
        placeId: placeDetails.place_id,
        googleMapsUrl: placeDetails.url || googleMapsUrl,
      };

      await handleBusinessSelect(businessFromUrl);
    } catch (error) {
      let errorType: BusinessError['type'] = 'general-error';
      let message = 'Failed to process Google Maps URL';
      let details = 'Unable to extract business information from the provided URL.';

      if (isNetworkError(error)) {
        errorType = 'network-error';
        message = 'Unable to connect to Google Places';
        details = 'Please check your internet connection and try again.';
      } else if (isApiError(error)) {
        if (error.code === 'INVALID_URL') {
          errorType = 'invalid-url';
          message = 'Invalid Google Maps URL';
          details = "The URL doesn't appear to be a valid Google Maps business page.";
        } else if (error.code === 'PLACE_NOT_FOUND') {
          errorType = 'business-not-found';
          message = 'Business not found';
          details = 'Unable to find business information for this URL.';
        } else if (error.status >= 500) {
          errorType = 'google-places-unavailable';
          message = 'Google Places service is temporarily unavailable';
          details = 'This is usually a temporary issue. Please try again in a moment.';
        } else {
          message = error.message;
          details = typeof error.details === 'string' ? error.details : details;
        }
      }

      setCurrentError({
        type: errorType,
        message,
        details,
        canRetry: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Error handling functions
  const handleRetry = () => {
    if (currentError?.type === 'business-not-found' || currentError?.type === 'search-failed') {
      if (searchQuery.trim()) {
        performSearch(searchQuery, true);
      }
    } else if (
      currentError?.type === 'network-error' ||
      currentError?.type === 'google-places-unavailable'
    ) {
      if (searchMethod === 'search' && searchQuery.trim()) {
        performSearch(searchQuery, true);
      } else if (searchMethod === 'url' && googleMapsUrl.trim()) {
        handleUrlSubmit();
      }
    } else if (currentError?.type === 'general-error') {
      if (businessPreview) {
        // Retry fetching business details
        handleBusinessSelect(selectedBusiness!);
      }
    }
  };

  const handleShowManualEntry = () => {
    setShowManualEntry(true);
    setCurrentError(null);
  };

  const handleManualEntrySubmit = async (businessData: BusinessData) => {
    setIsLoadingPreview(true);
    setCurrentError(null);

    try {
      // For manual entry, immediately show the preview
      setBusinessPreview(businessData);
      setSelectedBusiness(businessData);
      setIsBusinessConfirmed(false);
      setShowManualEntry(false);
    } catch (error) {
      setCurrentError({
        type: 'general-error',
        message: 'Failed to create business profile',
        details: 'There was an error processing your business information.',
        canRetry: true,
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleManualEntryCancel = () => {
    setShowManualEntry(false);
  };

  const hasError = (field: keyof typeof errors) => Boolean(errors[field]);
  const getError = (field: keyof typeof errors) => errors[field];

  // Don't show manual entry form if we already have a business selected
  if (showManualEntry && !businessPreview) {
    return (
      <div className={cn('space-y-6', className)}>
        <ManualBusinessEntry
          onSubmit={handleManualEntrySubmit}
          onCancel={handleManualEntryCancel}
          isLoading={isLoadingPreview}
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-charcoal mb-2">
          Let's find your business on Google
        </h3>
        <p className="text-gray-600 text-sm">
          Connect your Google Business Profile to automatically import your business details,
          reviews, and customer information. This ensures your review requests link directly to the
          right place and look professional to your customers.
        </p>
      </div>

      {/* Search Method Toggle */}
      {!businessPreview && (
        <div className="flex justify-center">
          <SearchMethodToggle value={searchMethod} onChange={setSearchMethod} />
        </div>
      )}

      {/* Recovery State for Retries */}
      {isRetrying && (
        <RecoveryState message={`Retrying${retryCount > 1 ? ` (attempt ${retryCount})` : ''}...`} />
      )}

      {/* Error States */}
      {currentError && !isRetrying && (
        <ErrorState
          error={currentError}
          onRetry={currentError.canRetry ? handleRetry : undefined}
          onManualEntry={handleShowManualEntry}
        />
      )}

      {/* Search Input Method */}
      {!businessPreview && !currentError && searchMethod === 'search' && (
        <div className="space-y-4">
          {/* Search Input */}
          <div>
            <label
              htmlFor="business-search"
              className="block text-sm font-semibold text-charcoal mb-2"
            >
              Business Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="business-search"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search for your business name..."
                className={cn(
                  'w-full pl-10 pr-4 py-3 border rounded-lg text-base transition-colors focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent',
                  hasError('search') ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                )}
                aria-describedby={hasError('search') ? 'search-error' : 'search-help'}
              />
              {isLoading && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Loader2 className="h-5 w-5 text-forgedorange-500 animate-spin" />
                </div>
              )}
            </div>

            {/* Error Message */}
            {hasError('search') && (
              <p id="search-error" className="mt-2 text-sm text-red-600" role="alert">
                {getError('search')}
              </p>
            )}

            {/* Help Text */}
            {!hasError('search') && (
              <p id="search-help" className="mt-2 text-sm text-gray-500">
                Start typing your business name to see suggestions
              </p>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-charcoal">Search Results:</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((business, index) => (
                  <button
                    key={`${business.placeId}-${index}`}
                    onClick={() => handleBusinessSelect(business)}
                    className={cn(
                      'w-full p-4 text-left border rounded-lg transition-all hover:border-forgedorange-300 hover:bg-forgedorange-50 focus:outline-none focus:border-forgedorange-700 focus:ring-2 focus:ring-forgedorange-500',
                      selectedBusiness?.placeId === business.placeId
                        ? 'border-forgedorange-500 bg-forgedorange-50'
                        : 'border-gray-200 bg-white'
                    )}
                    aria-pressed={selectedBusiness?.placeId === business.placeId}
                  >
                    <div className="flex items-start space-x-3">
                      <MapPin className="h-5 w-5 text-forgedorange-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal truncate">
                          {business.name}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">{business.address}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual Entry Prompt for Search */}
          {searchQuery.length >= 2 && searchResults.length === 0 && !isLoading && !currentError && (
            <ManualEntryPrompt onManualEntry={handleShowManualEntry} />
          )}
        </div>
      )}

      {/* URL Input Method */}
      {!businessPreview && !currentError && searchMethod === 'url' && (
        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label
              htmlFor="google-maps-url"
              className="block text-sm font-semibold text-charcoal mb-2"
            >
              Google Maps URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <ExternalLink className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="url"
                id="google-maps-url"
                value={googleMapsUrl}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder="Paste your Google Maps business URL"
                className={cn(
                  'w-full pl-10 pr-4 py-3 border rounded-lg text-base transition-colors focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent',
                  hasError('url') ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                )}
                aria-describedby={hasError('url') ? 'url-error' : 'url-help'}
              />
            </div>

            {/* Error Message */}
            {hasError('url') && (
              <p id="url-error" className="mt-2 text-sm text-red-600" role="alert">
                {getError('url')}
              </p>
            )}

            {/* Help Text */}
            {!hasError('url') && (
              <div id="url-help" className="mt-2 space-y-2">
                <p className="text-sm text-gray-500">
                  Find your business on Google Maps and copy the URL from your browser
                </p>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Example:</p>
                  <code className="text-xs text-charcoal bg-white px-2 py-1 rounded break-all">
                    https://www.google.com/maps/place/Your+Business+Name
                  </code>
                </div>
              </div>
            )}

            {/* Submit Button for URL */}
            <button
              type="button"
              onClick={handleUrlSubmit}
              disabled={!googleMapsUrl.trim() || hasError('url') || isLoading}
              className={cn(
                'mt-4 w-full sm:w-auto px-6 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:border-forgedorange-700',
                !googleMapsUrl.trim() || hasError('url') || isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-forgedorange-500 text-white hover:bg-forgedorange-600'
              )}
            >
              {isLoading ? 'Processing...' : 'Find Business'}
            </button>
          </div>

          {/* Manual Entry Prompt for URL */}
          <ManualEntryPrompt onManualEntry={handleShowManualEntry} />
        </div>
      )}

      {/* Business Preview */}
      {(businessPreview || isLoadingPreview) && (
        <div className="mt-8">
          <BusinessPreviewCard
            business={businessPreview!}
            isLoading={isLoadingPreview || isCreatingBusiness}
            isConfirmed={isBusinessConfirmed}
            onConfirm={handleBusinessConfirm}
            onBusinessUpdate={handleBusinessUpdate}
          />

          {/* Business Creation Loading State */}
          {isCreatingBusiness && (
            <div className="mt-4 bg-forgedorange-50 border border-forgedorange-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Loader2 className="h-5 w-5 text-forgedorange-500 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-forgedorange-800">
                    Creating your business profile...
                  </p>
                  <p className="text-sm text-forgedorange-600 mt-1">
                    This may take a moment as we set up your account.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
