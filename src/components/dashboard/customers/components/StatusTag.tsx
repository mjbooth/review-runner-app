import React from 'react';
import type { StatusTagProps } from '../types';

export function StatusTag({ status, className = '' }: StatusTagProps): React.ReactElement {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

  const statusClasses = {
    active: 'bg-green-100 text-green-800',
    suppressed: 'bg-red-100 text-red-800',
  };

  const statusText = {
    active: 'Active',
    suppressed: 'Suppressed',
  };

  return (
    <span className={`${baseClasses} ${statusClasses[status]} ${className}`}>
      {statusText[status]}
    </span>
  );
}
