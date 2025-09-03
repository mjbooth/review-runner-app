import React from 'react';
import { UsersIcon, Search } from '@/components/ui/icons';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title = 'No customers found',
  description = 'Get started by adding your first customer.',
  actionLabel = 'Add Customer',
  onAction,
}: EmptyStateProps): React.ReactElement {
  // Use search icon if title contains "match" (indicating filtered results)
  const isFilteredEmpty = title.toLowerCase().includes('match');
  const Icon = isFilteredEmpty ? Search : UsersIcon;

  return (
    <div className="text-center py-16">
      <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-xl font-medium text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">{description}</p>
      {onAction && (
        <button
          onClick={onAction}
          className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
            isFilteredEmpty
              ? 'text-forgedorange-700 bg-forgedorange-50 hover:bg-forgedorange-100 border-forgedorange-200 focus:ring-forgedorange-500'
              : 'text-white bg-forgedorange-600 hover:bg-forgedorange-700 focus:ring-forgedorange-500'
          }`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
