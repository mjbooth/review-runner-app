import React from 'react';
import type { Customer } from './types';
import { StatusTag } from './components/StatusTag';
import { formatName, formatDate, formatPhoneNumber, getInitials } from './utils';

interface CustomerMobileCardProps {
  customer: Customer;
  selected: boolean;
  onSelect: (customerId: string) => void;
  onContextMenu: (event: React.MouseEvent, customer: Customer) => void;
}

export function CustomerMobileCard({
  customer,
  selected,
  onSelect,
  onContextMenu,
}: CustomerMobileCardProps): React.ReactElement {
  const initials = getInitials(customer.firstName, customer.lastName);

  return (
    <div
      className={`
        bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm
        ${selected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'}
        transition-all duration-200
      `}
      onContextMenu={e => onContextMenu(e, customer)}
    >
      {/* Header with avatar and name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">
              {formatName(customer.firstName)} {formatName(customer.lastName)}
            </h3>
            <StatusTag status={customer.suppressed} />
          </div>
          <p className="text-sm text-gray-500">{customer.email}</p>
        </div>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(customer.id)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
      </div>

      {/* Contact info */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Phone:</span>
          <span className="text-gray-900">{formatPhoneNumber(customer.phone)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Added:</span>
          <span className="text-gray-900">{formatDate(customer.dateAdded)}</span>
        </div>
        {customer.lastRequest && (
          <div className="flex justify-between">
            <span className="text-gray-500">Last Request:</span>
            <span className="text-gray-900">{formatDate(customer.lastRequest)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
