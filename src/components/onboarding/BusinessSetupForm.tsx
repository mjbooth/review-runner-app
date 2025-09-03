'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface BusinessSetupFormProps {
  user: any;
  onComplete: (business: any) => void;
}

export function BusinessSetupForm({ user, onComplete }: BusinessSetupFormProps) {
  const { getToken } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: user?.emailAddresses?.[0]?.emailAddress || '',
    phone: '',
    timezone: 'Europe/London',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();

      const response = await fetch('/api/businesses/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clerkUserId: user.id,
          ...formData,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onComplete(result.data);
      } else {
        setError(result.error?.message || 'Failed to create business account');
      }
    } catch (err) {
      setError('An error occurred while setting up your business');
      console.error('Business setup error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-charcoal mb-2">Set Up Your Business</h2>
        <p className="text-gray-600">
          Let's get your business profile set up so you can start sending review requests.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex">
            <svg
              className="w-5 h-5 text-red-400 mr-2 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Business Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Enter your business name"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Business Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            value={formData.email}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="business@example.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
            Business Phone
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="+44 123 456 7890"
          />
          <p className="text-sm text-gray-500 mt-1">Optional - used for SMS sender ID</p>
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="Europe/London">London (GMT/BST)</option>
            <option value="Europe/Dublin">Dublin (GMT/IST)</option>
            <option value="Europe/Edinburgh">Edinburgh (GMT/BST)</option>
            <option value="Europe/Cardiff">Cardiff (GMT/BST)</option>
          </select>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isLoading || !formData.name || !formData.email}
            className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Creating Business...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500">
          You can update these details later in your account settings
        </p>
      </div>
    </div>
  );
}
