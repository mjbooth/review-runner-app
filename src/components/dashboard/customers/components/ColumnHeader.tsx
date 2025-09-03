import React from 'react';
import { ChevronUp, ChevronDown } from '@/components/ui/icons';

interface ColumnHeaderProps {
  label: string;
  sortable: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
  className?: string;
}

export function ColumnHeader({
  label,
  sortable,
  sortDirection,
  onSort,
  className = '',
}: ColumnHeaderProps): React.ReactElement {
  return (
    <th
      className={`
        px-6 py-3 text-left text-sm font-bold font-sans text-charcoal
        bg-gray-50 border-b border-gray-200 whitespace-nowrap
        ${sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}
        ${className}
      `}
      onClick={sortable ? onSort : undefined}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {sortable && (
          <div className="flex flex-col">
            <ChevronUp
              className={`w-3 h-3 ${sortDirection === 'asc' ? 'text-gray-900' : 'text-gray-400'}`}
            />
            <ChevronDown
              className={`w-3 h-3 -mt-1 ${
                sortDirection === 'desc' ? 'text-gray-900' : 'text-gray-400'
              }`}
            />
          </div>
        )}
      </div>
    </th>
  );
}
