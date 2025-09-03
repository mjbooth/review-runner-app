'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface BusinessData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  website?: string;
  googlePlaceId?: string;
  googlePlaceName?: string;
  googleReviewUrl?: string;
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  googleTypes?: string[];
  googlePhoneNumber?: string;
  googleWebsite?: string;
  googlePhotos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  lastSyncedAt?: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function BusinessPage() {
  const { getToken } = useAuth();
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBusinessData = async () => {
    try {
      setError(null);
      const token = await getToken();

      const response = await fetch('/api/businesses/current', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        setBusiness(result.data);
      } else {
        setError(result.error?.message || 'Failed to load business data');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error fetching business data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshGoogleData = async () => {
    if (!business?.googlePlaceId) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const token = await getToken();

      const response = await fetch('/api/businesses/refresh-google-data', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        setBusiness(result.data);
      } else {
        setError(result.error?.message || 'Failed to refresh Google data');
      }
    } catch (err) {
      setError('Failed to refresh Google data');
      console.error('Error refreshing Google data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBusinessData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={fetchBusinessData}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">No business data found</div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRatingStars = (rating?: number) => {
    if (!rating) return null;

    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <div className="flex items-center">
        {[...Array(fullStars)].map((_, i) => (
          <svg
            key={`full-${i}`}
            className="w-5 h-5 text-yellow-400 fill-current"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        {hasHalfStar && (
          <svg className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
            <defs>
              <linearGradient id="half">
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              fill="url(#half)"
              d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"
            />
          </svg>
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <svg
            key={`empty-${i}`}
            className="w-5 h-5 text-gray-300 fill-current"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        <span className="ml-2 text-sm text-gray-600">({rating.toFixed(1)})</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">{business.name}</h1>
              {business.googlePlaceId && (
                <button
                  onClick={refreshGoogleData}
                  disabled={isRefreshing}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isRefreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Refresh Google Data
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Contact Information</h3>
                <div className="space-y-2 text-gray-600">
                  <p>
                    <strong>Email:</strong> {business.email}
                  </p>
                  {business.phone && (
                    <p>
                      <strong>Phone:</strong> {business.phone}
                    </p>
                  )}
                  {business.address && (
                    <p>
                      <strong>Address:</strong> {business.address}
                    </p>
                  )}
                  {business.website && (
                    <p>
                      <strong>Website:</strong>
                      <a
                        href={business.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline ml-1"
                      >
                        {business.website}
                      </a>
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Account Details</h3>
                <div className="space-y-2 text-gray-600">
                  <p>
                    <strong>Timezone:</strong> {business.timezone}
                  </p>
                  <p>
                    <strong>Status:</strong>
                    <span
                      className={`ml-1 px-2 py-1 rounded-full text-xs ${business.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {business.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </p>
                  <p>
                    <strong>Created:</strong> {formatDate(business.createdAt)}
                  </p>
                  <p>
                    <strong>Last Updated:</strong> {formatDate(business.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Google Places Data */}
        {business.googlePlaceId ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Google Business Profile</h2>
                {business.lastSyncedAt && (
                  <p className="text-sm text-gray-500">
                    Last updated: {formatDate(business.lastSyncedAt)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Google Business Info */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-4">Business Information</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Google Business Name</p>
                      <p className="text-gray-900">{business.googlePlaceName}</p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500">Place ID</p>
                      <p className="text-gray-900 font-mono text-sm bg-gray-50 p-2 rounded">
                        {business.googlePlaceId}
                      </p>
                    </div>

                    {business.googleTypes && business.googleTypes.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Business Types</p>
                        <div className="flex flex-wrap gap-2">
                          {business.googleTypes.map((type, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                            >
                              {type.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {business.googlePhoneNumber && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Google Phone</p>
                        <p className="text-gray-900">{business.googlePhoneNumber}</p>
                      </div>
                    )}

                    {business.googleWebsite && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Google Website</p>
                        <a
                          href={business.googleWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {business.googleWebsite}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reviews and Rating */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-4">Reviews & Rating</h3>
                  <div className="space-y-4">
                    {business.googleRating ? (
                      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-lg border border-yellow-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-3xl font-bold text-gray-900">
                            {business.googleRating.toFixed(1)}
                          </span>
                          <div className="text-right">
                            <div>{getRatingStars(business.googleRating)}</div>
                            <p className="text-sm text-gray-600 mt-1">
                              {business.googleReviewCount || 0} reviews
                            </p>
                          </div>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                          <div
                            className="bg-yellow-400 h-2 rounded-full"
                            style={{ width: `${(business.googleRating / 5) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                        <p className="text-gray-500 text-center">No review data available</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {business.googleReviewUrl && (
                        <a
                          href={business.googleReviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-green-600 text-white text-center py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Write a Review
                        </a>
                      )}
                      {business.googleMapsUrl && (
                        <a
                          href={business.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-600 text-white text-center py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          View on Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
            <div className="p-6 text-center">
              <div className="text-gray-400 mb-4">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                No Google Business Connected
              </h3>
              <p className="text-gray-500 mb-4">
                Connect your Google Business Profile to see reviews, ratings, and business
                information.
              </p>
              <a
                href="/onboarding"
                className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors"
              >
                Connect Google Business
              </a>
            </div>
          </div>
        )}

        {/* Business Photos */}
        {business.googlePhotos &&
          Array.isArray(business.googlePhotos) &&
          business.googlePhotos.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Business Photos</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {business.googlePhotos.slice(0, 8).map((photo, index) => (
                    <div
                      key={index}
                      className="aspect-square bg-gray-100 rounded-lg overflow-hidden"
                    >
                      <img
                        src={`/api/places/photo?photoName=${photo.photo_reference}&maxHeightPx=400`}
                        alt={`${business.name} photo ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
