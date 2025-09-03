'use client';

import React from 'react';

interface BusinessProfileSectionProps {
  businessData: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    timezone?: string;
    googlePlaceId?: string;
    googlePlaceName?: string;
    googleReviewUrl?: string;
    googleMapsUrl?: string;
    googleRating?: number;
    googleReviewCount?: number;
    googleTypes?: string[];
    googlePhoneNumber?: string;
    googleWebsite?: string;
    googlePhotos?: any;
    lastSyncedAt?: string;
    smsCreditsUsed?: number;
    smsCreditsLimit?: number;
    emailCreditsUsed?: number;
    emailCreditsLimit?: number;
  };
}

export function BusinessProfileSection({ businessData }: BusinessProfileSectionProps) {
  const hasGoogleData = businessData.googlePlaceId || businessData.googlePlaceName;

  const formatRating = (rating: number) => {
    return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Section Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-charcoal">Business Profile</h2>
            <p className="text-sm text-gray-600 mt-1">
              Your business information from Google Places (read-only)
            </p>
          </div>

          {/* Google Attribution */}
          <div className="flex items-center text-xs text-gray-500">
            <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.017 14.999c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zm-5.017-2.5c0 2.76 2.24 5 5 5s5-2.24 5-5-2.24-5-5-5-5 2.24-5 5z" />
              <path d="M12.017 20.999c-4.95 0-9-4.05-9-9s4.05-9 9-9 9 4.05 9 9-4.05 9-9 9z" />
            </svg>
            Powered by Google Places API
          </div>
        </div>
      </div>

      <div className="p-6">
        {!hasGoogleData ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h4M9 7h6m-6 4h6m-2 4h2M7 7h.01M7 11h.01M7 15h.01"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Google Places Data</h3>
            <p className="text-gray-600 mb-4">
              Connect your Google Places listing to display comprehensive business information.
            </p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Connect Google Places
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Basic Information */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-4">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Business Name
                    </label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={businessData.googlePlaceName || businessData.name}
                        readOnly
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                      />
                      <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        Google Places
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <div className="flex items-center">
                      <textarea
                        value={businessData.address || 'Not provided'}
                        readOnly
                        rows={2}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 resize-none"
                      />
                      <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded h-fit">
                        Google Places
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <div className="flex items-center">
                        <input
                          type="tel"
                          value={
                            businessData.googlePhoneNumber || businessData.phone || 'Not provided'
                          }
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                        />
                        <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Google
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Website
                      </label>
                      <div className="flex items-center">
                        <input
                          type="url"
                          value={
                            businessData.googleWebsite || businessData.website || 'Not provided'
                          }
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                        />
                        <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Google
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Business Categories */}
                  {businessData.googleTypes && businessData.googleTypes.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Business Categories
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {businessData.googleTypes.slice(0, 5).map((type, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                          >
                            {type
                              .replace(/_/g, ' ')
                              .toLowerCase()
                              .replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        ))}
                        {businessData.googleTypes.length > 5 && (
                          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                            +{businessData.googleTypes.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Timezone */}
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-4">Business Location</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={businessData.timezone || 'Europe/London'}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                      />
                    </div>
                    {businessData.googleMapsUrl && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Google Maps URL
                        </label>
                        <a
                          href={businessData.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          View on Google Maps →
                        </a>
                      </div>
                    )}
                    {businessData.googleReviewUrl && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Review URL
                        </label>
                        <a
                          href={businessData.googleReviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          Write a Review →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Review Statistics & Photos */}
            <div className="space-y-6">
              {/* Review Statistics */}
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-4">Review Statistics</h3>
                <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 mb-1">
                        {businessData.googleRating || 'N/A'}
                      </div>
                      <div className="text-yellow-500 text-lg mb-1">
                        {businessData.googleRating
                          ? formatRating(businessData.googleRating)
                          : '☆☆☆☆☆'}
                      </div>
                      <div className="text-sm text-gray-600">Average Rating</div>
                    </div>

                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 mb-1">
                        {businessData.googleReviewCount || 0}
                      </div>
                      <div className="text-sm text-gray-600">Total Reviews</div>
                      <div className="text-xs text-gray-500 mt-1">on Google</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage Credits */}
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-4">Usage Credits</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">SMS Credits</span>
                      <span className="text-sm text-gray-600">
                        {businessData.smsCreditsUsed || 0} / {businessData.smsCreditsLimit || 1000}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${((businessData.smsCreditsUsed || 0) / (businessData.smsCreditsLimit || 1000)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Email Credits</span>
                      <span className="text-sm text-gray-600">
                        {businessData.emailCreditsUsed || 0} /{' '}
                        {businessData.emailCreditsLimit || 5000}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{
                          width: `${((businessData.emailCreditsUsed || 0) / (businessData.emailCreditsLimit || 5000)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Photos */}
              {businessData.googlePhotos &&
              Array.isArray(businessData.googlePhotos) &&
              businessData.googlePhotos.length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold text-charcoal mb-4">Business Photos</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {businessData.googlePhotos.slice(0, 4).map((photo: any, index: number) => (
                      <div
                        key={index}
                        className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img
                          src={photo.url || photo}
                          alt={`Business photo ${index + 1}`}
                          className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-semibold text-charcoal mb-4">Business Photos</h3>
                  <div className="text-center py-6 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-6 h-6 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600">No photos available</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Add photos to your Google Business Profile
                    </p>
                  </div>
                </div>
              )}

              {/* Last Updated */}
              {businessData.lastSyncedAt && (
                <div className="text-xs text-gray-500 text-center">
                  <div className="flex items-center justify-center">
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Last synced: {new Date(businessData.lastSyncedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
