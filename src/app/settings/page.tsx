'use client';

import Link from 'next/link';
import { Building2Icon } from '@/components/ui/icons/Building2';
import { ChevronRightIcon } from '@/components/ui/icons/ChevronRight';

export default function SettingsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your account and application preferences
        </p>
      </div>

      {/* Settings Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Business Settings Card */}
        <Link
          href="/settings/business"
          className="group relative bg-white p-6 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Building2Icon className="h-6 w-6 text-forgedorange-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900 group-hover:text-forgedorange-600">
                    Business Settings
                  </h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Manage your business profile, contact information, and Google integration
              </p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-gray-400 group-hover:text-forgedorange-600 transition-colors" />
          </div>
        </Link>

        {/* Placeholder for future settings */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 opacity-60">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-6 w-6 bg-gray-300 rounded"></div>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-gray-500">
                More Settings
              </h3>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Additional settings coming soon
          </p>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 opacity-60">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-6 w-6 bg-gray-300 rounded"></div>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-gray-500">
                Account Settings
              </h3>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Coming soon
          </p>
        </div>
      </div>
    </div>
  );
}