'use client';

import React from 'react';
import { Search, Link } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

export type SearchMethod = 'search' | 'url';

interface SearchMethodToggleProps {
  value: SearchMethod;
  onChange: (method: SearchMethod) => void;
  className?: string;
}

export function SearchMethodToggle({ value, onChange, className }: SearchMethodToggleProps) {
  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => onChange('search')}
          className={cn(
            'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 focus:outline-none focus:border-forgedorange-700',
            value === 'search'
              ? 'bg-white text-forgedorange-700 shadow-sm'
              : 'text-gray-600 hover:text-charcoal'
          )}
          aria-pressed={value === 'search'}
          aria-label="Search for business"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
        </button>

        <button
          type="button"
          onClick={() => onChange('url')}
          className={cn(
            'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 focus:outline-none focus:border-forgedorange-700',
            value === 'url'
              ? 'bg-white text-forgedorange-700 shadow-sm'
              : 'text-gray-600 hover:text-charcoal'
          )}
          aria-pressed={value === 'url'}
          aria-label="Paste Google Maps URL"
        >
          <Link className="w-4 h-4" />
          <span className="hidden sm:inline">URL</span>
        </button>
      </div>

      <div className="text-sm text-gray-600">
        {value === 'search' ? 'Search for your business' : 'Paste Google Maps URL'}
      </div>
    </div>
  );
}
