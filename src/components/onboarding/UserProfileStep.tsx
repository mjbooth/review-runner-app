'use client';

import React, { useState, useEffect } from 'react';
import { User, Mail } from '@/components/ui/icons';
import { updateUserProfile } from '@/services/onboarding';

interface UserProfileStepProps {
  onNext?: () => void;
  onBack?: () => void;
  canGoNext?: boolean;
  canGoBack?: boolean;
  onValidation?: (isValid: boolean) => void;
  initialData?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

export function UserProfileStep({
  onNext,
  onBack,
  canGoNext,
  canGoBack,
  onValidation,
  initialData,
}: UserProfileStepProps) {
  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate form
  const isValid = firstName.trim().length > 0;

  // Notify parent of validation status
  useEffect(() => {
    onValidation?.(isValid);
  }, [isValid, onValidation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) return;

    try {
      setSaving(true);
      setError(null);

      // Update user profile
      const result = await updateUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
      });

      if (result.success) {
        onNext?.();
      } else {
        setError(result.error || 'Failed to save profile');
      }
    } catch (err) {
      setError('An error occurred while saving your profile');
      console.error('Profile save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-forgedorange-100 rounded-full mb-4">
          <User className="h-8 w-8 text-forgedorange-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Tell us about yourself</h2>
        <p className="text-gray-600">
          Let's start by setting up your profile so we can personalize your experience
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email (read-only) */}
        {initialData?.email && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                id="email"
                value={initialData.email}
                disabled
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* First Name */}
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="firstName"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Enter your first name"
            className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500 transition-colors"
            required
            disabled={saving}
          />
        </div>

        {/* Last Name */}
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
            Last Name
          </label>
          <input
            type="text"
            id="lastName"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Enter your last name (optional)"
            className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500 transition-colors"
            disabled={saving}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack || saving}
            className="px-6 py-2 text-gray-600 hover:text-charcoal disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>

          <button
            type="submit"
            disabled={!isValid || saving}
            className="px-6 py-2 bg-forgedorange-500 text-white rounded-lg hover:bg-forgedorange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Saving...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
