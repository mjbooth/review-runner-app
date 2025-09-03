'use client';

import React, { useState } from 'react';
import { Search, ArrowUpDown, X, Filter } from '@/components/ui/icons';

export interface FilterValues {
  status: string[];
  channel: string[];
  suppressed: string[];
  dateAdded: string;
  lastRequest: string;
}

interface TableHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalCount: number;
  onFilter?: () => void;
  onSort?: () => void;
  onFiltersChange?: (filters: FilterValues) => void;
  activeFiltersCount?: number;
  searching?: boolean;
}

export function TableHeader({
  searchQuery,
  onSearchChange,
  totalCount,
  onFilter,
  onSort,
  onFiltersChange,
  activeFiltersCount = 0,
  searching = false,
}: TableHeaderProps): React.ReactElement {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({
    status: [],
    channel: [],
    suppressed: [],
    dateAdded: '',
    lastRequest: '',
  });

  const handleFilter = () => {
    setShowFilters(!showFilters);
    onFilter?.();
  };

  const updateFilter = (key: keyof FilterValues, value: string[] | string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const toggleArrayFilter = (key: 'status' | 'channel' | 'suppressed', value: string) => {
    const currentValues = filters[key];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    updateFilter(key, newValues);
  };

  const clearAllFilters = () => {
    const emptyFilters = {
      status: [],
      channel: [],
      suppressed: [],
      dateAdded: '',
      lastRequest: '',
    };
    setFilters(emptyFilters);
    onFiltersChange?.(emptyFilters);
  };

  // Available filter options
  const statusOptions = [
    'Draft',
    'Ready',
    'Scheduled',
    'Review Sent',
    'Review Clicked',
    'Review Failed',
    'Follow-up Sent',
    'Follow-up Clicked',
    'Follow-up Failed',
  ];

  const channelOptions = ['email', 'sms'];
  const suppressedOptions = [
    { value: 'active', label: 'Active' },
    { value: 'suppressed', label: 'Suppressed' },
  ];

  const dateOptions = [
    { value: '', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: '3months', label: 'Last 3 months' },
  ];

  const lastRequestOptions = [
    { value: '', label: 'All customers' },
    { value: 'has-request', label: 'Has requests' },
    { value: 'no-request', label: 'No requests' },
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      {/* Search and controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {searching ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-forgedorange-500"></div>
            ) : (
              <Search className="h-4 w-4 text-gray-400" />
            )}
          </div>
          <input
            type="text"
            placeholder={`Search ${totalCount} customers...`}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className={`block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-forgedorange-500 focus:border-forgedorange-500 text-sm ${
              searching ? 'bg-gray-50' : ''
            }`}
          />
        </div>

        {/* Filter and sort controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFilter}
            className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-forgedorange-500 ${
              showFilters
                ? 'border-forgedorange-300 text-forgedorange-700 bg-forgedorange-50'
                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter
            {activeFiltersCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-forgedorange-100 text-forgedorange-800">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <button
            onClick={onSort}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-forgedorange-500"
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Sort
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">Filter customers</h3>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-forgedorange-600 hover:text-forgedorange-700 font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Status filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {statusOptions.map(status => (
                  <label key={status} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(status)}
                      onChange={() => toggleArrayFilter('status', status)}
                      className="h-4 w-4 text-forgedorange-600 border-gray-300 rounded focus:ring-forgedorange-500"
                    />
                    <span className="ml-2 text-xs text-gray-700">{status}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Channel filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Channel</label>
              <div className="space-y-2">
                {channelOptions.map(channel => (
                  <label key={channel} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.channel.includes(channel)}
                      onChange={() => toggleArrayFilter('channel', channel)}
                      className="h-4 w-4 text-forgedorange-600 border-gray-300 rounded focus:ring-forgedorange-500"
                    />
                    <span className="ml-2 text-xs text-gray-700 capitalize">{channel}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Suppression status filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Account Status</label>
              <div className="space-y-2">
                {suppressedOptions.map(option => (
                  <label key={option.value} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.suppressed.includes(option.value)}
                      onChange={() => toggleArrayFilter('suppressed', option.value)}
                      className="h-4 w-4 text-forgedorange-600 border-gray-300 rounded focus:ring-forgedorange-500"
                    />
                    <span className="ml-2 text-xs text-gray-700">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date added filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Date Added</label>
              <select
                value={filters.dateAdded}
                onChange={e => updateFilter('dateAdded', e.target.value)}
                className="block w-full text-xs border-gray-300 rounded-md focus:ring-forgedorange-500 focus:border-forgedorange-500"
              >
                {dateOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Last request filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Request History
              </label>
              <select
                value={filters.lastRequest}
                onChange={e => updateFilter('lastRequest', e.target.value)}
                className="block w-full text-xs border-gray-300 rounded-md focus:ring-forgedorange-500 focus:border-forgedorange-500"
              >
                {lastRequestOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
