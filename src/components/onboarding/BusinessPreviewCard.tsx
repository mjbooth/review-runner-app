'use client';

import React, { useState } from 'react';
import { MapPin, Phone, Globe, Edit2, Check, X, Building2, Loader2 } from '@/components/ui/icons';
import { StarRating } from '@/components/ui/StarRating';
import { cn } from '@/lib/utils';

export interface BusinessData {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  placeId?: string;
  googleMapsUrl?: string;
  businessHours?: string[];
  categories?: string[];
}

interface BusinessPreviewCardProps {
  business: BusinessData;
  isLoading?: boolean;
  isConfirmed?: boolean;
  onConfirm?: (confirmed: boolean) => void;
  onBusinessUpdate?: (updatedBusiness: BusinessData) => void;
  className?: string;
}

export function BusinessPreviewCard({
  business,
  isLoading = false,
  isConfirmed = false,
  onConfirm,
  onBusinessUpdate,
  className,
}: BusinessPreviewCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBusiness, setEditedBusiness] = useState<BusinessData>(business);

  const handleEdit = () => {
    setIsEditing(true);
    setEditedBusiness(business);
  };

  const handleSave = () => {
    onBusinessUpdate?.(editedBusiness);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedBusiness(business);
    setIsEditing(false);
  };

  const handleFieldChange = (field: keyof BusinessData, value: string) => {
    setEditedBusiness(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleConfirmChange = (confirmed: boolean) => {
    onConfirm?.(confirmed);
  };

  if (isLoading) {
    return <LoadingSkeleton className={className} />;
  }

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-forgedorange-500" />
            <span>Business Preview</span>
          </h3>
          {!isEditing && (
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-charcoal hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:border-gray-500"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Business Photo and Basic Info */}
        <div className="flex flex-col sm:flex-row sm:space-x-6 space-y-4 sm:space-y-0">
          {/* Photo Placeholder */}
          <div className="flex-shrink-0">
            <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden">
              {business.photoUrl ? (
                <img
                  src={business.photoUrl}
                  alt={`${business.name} photo`}
                  className="w-full h-full object-cover rounded-lg"
                  onError={e => {
                    // Hide image on error and show placeholder
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement
                      ?.querySelector('.photo-placeholder')
                      ?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`text-center ${business.photoUrl ? 'hidden photo-placeholder' : ''}`}>
                <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                <span className="text-xs text-gray-500">Photo</span>
              </div>
            </div>
          </div>

          {/* Business Info */}
          <div className="flex-1 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedBusiness.name}
                  onChange={e => handleFieldChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent"
                />
              ) : (
                <p className="text-lg font-semibold text-charcoal">{business.name}</p>
              )}
            </div>

            {/* Rating */}
            {business.rating && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                <StarRating
                  rating={business.rating}
                  showValue
                  showCount
                  reviewCount={business.reviewCount}
                  size="md"
                />
              </div>
            )}
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-4">
          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            {isEditing ? (
              <textarea
                value={editedBusiness.address}
                onChange={e => handleFieldChange('address', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent resize-none"
              />
            ) : (
              <div className="flex items-start space-x-2">
                <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <p className="text-charcoal">{business.address}</p>
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            {isEditing ? (
              <input
                type="tel"
                value={editedBusiness.phone || ''}
                onChange={e => handleFieldChange('phone', e.target.value)}
                placeholder="Enter phone number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent"
              />
            ) : business.phone ? (
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-gray-500" />
                <p className="text-charcoal">{business.phone}</p>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No phone number provided</p>
            )}
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            {isEditing ? (
              <input
                type="url"
                value={editedBusiness.website || ''}
                onChange={e => handleFieldChange('website', e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent"
              />
            ) : business.website ? (
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-gray-500" />
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-forgedorange-500 hover:text-forgedorange-600 hover:underline"
                >
                  {business.website}
                </a>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No website provided</p>
            )}
          </div>
        </div>

        {/* Edit Controls */}
        {isEditing && (
          <div className="flex items-center space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-forgedorange-500 text-white text-sm font-medium rounded-md hover:bg-forgedorange-600 focus:outline-none focus:border-forgedorange-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:border-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          </div>
        )}

        {/* Confirmation Section */}
        {!isEditing && (
          <div className="pt-6 border-t border-gray-200">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    id="business-confirmation"
                    checked={isConfirmed}
                    onChange={e => handleConfirmChange(e.target.checked)}
                    className="w-4 h-4 text-forgedorange-500 border-gray-300 rounded focus:ring-forgedorange-500 focus:ring-2"
                  />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="business-confirmation"
                    className="text-sm font-medium text-blue-900 cursor-pointer"
                  >
                    Is this your business?
                  </label>
                  <p className="text-sm text-blue-700 mt-1">
                    Please confirm that this information is correct. You can edit any incorrect
                    details above.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Google Attribution */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
            <span>Powered by</span>
            <div className="flex items-center space-x-1">
              <span className="font-medium">Google</span>
              <div className="flex space-x-0.5">
                <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                <div className="w-1 h-1 bg-red-500 rounded-full"></div>
                <div className="w-1 h-1 bg-yellow-500 rounded-full"></div>
                <div className="w-1 h-1 bg-green-500 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading skeleton component
function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-pulse',
        className
      )}
    >
      {/* Header Skeleton */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-gray-300 rounded"></div>
            <div className="w-32 h-5 bg-gray-300 rounded"></div>
          </div>
          <div className="w-12 h-6 bg-gray-300 rounded"></div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Photo and Info Skeleton */}
        <div className="flex flex-col sm:flex-row sm:space-x-6 space-y-4 sm:space-y-0">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-300 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 space-y-4">
            <div>
              <div className="w-24 h-4 bg-gray-300 rounded mb-2"></div>
              <div className="w-48 h-6 bg-gray-300 rounded"></div>
            </div>
            <div>
              <div className="w-16 h-4 bg-gray-300 rounded mb-2"></div>
              <div className="w-32 h-5 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>

        {/* Contact Info Skeleton */}
        <div className="space-y-4">
          <div>
            <div className="w-16 h-4 bg-gray-300 rounded mb-2"></div>
            <div className="w-full h-12 bg-gray-300 rounded"></div>
          </div>
          <div>
            <div className="w-20 h-4 bg-gray-300 rounded mb-2"></div>
            <div className="w-32 h-5 bg-gray-300 rounded"></div>
          </div>
          <div>
            <div className="w-16 h-4 bg-gray-300 rounded mb-2"></div>
            <div className="w-40 h-5 bg-gray-300 rounded"></div>
          </div>
        </div>

        {/* Confirmation Skeleton */}
        <div className="pt-6 border-t border-gray-200">
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="w-4 h-4 bg-gray-300 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="w-32 h-4 bg-gray-300 rounded"></div>
                <div className="w-full h-3 bg-gray-300 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
