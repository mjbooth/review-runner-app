import React from 'react';
import type { CustomerRowProps } from './types';
import { StatusTag } from './components/StatusTag';
import { formatName, formatDate, formatPhoneNumber, formatChannel } from './utils';

export function CustomerRow({
  customer,
  selected,
  onSelect,
  onContextMenu,
}: CustomerRowProps): React.ReactElement {
  return (
    <tr
      className={`
        border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200
        ${selected ? 'bg-forgedorange-50 border-forgedorange-200' : ''}
      `}
      onContextMenu={e => onContextMenu(e, customer)}
    >
      {/* Checkbox */}
      <td className="px-6 py-3 whitespace-nowrap">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(customer.id)}
          className="w-4 h-4 text-forgedorange-600 border-gray-300 rounded focus:ring-forgedorange-500"
        />
      </td>

      {/* First Name */}
      <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {formatName(customer.firstName)}
      </td>

      {/* Last Name */}
      <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {formatName(customer.lastName)}
      </td>

      {/* Email */}
      <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {customer.email.toLowerCase()}
      </td>

      {/* Phone */}
      <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {formatPhoneNumber(customer.phone)}
      </td>

      {/* Date Added */}
      <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {formatDate(customer.dateAdded)}
      </td>

      {/* Suppressed Status */}
      <td className="px-6 py-3 whitespace-nowrap text-center">
        <StatusTag status={customer.suppressed} />
      </td>

      {/* Last Request - Hidden on mobile */}
      <td className="hidden md:table-cell px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {formatDate(customer.lastRequest)}
      </td>

      {/* Status - Hidden on mobile */}
      <td className="hidden lg:table-cell px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {customer.status}
      </td>

      {/* Channel - Hidden on mobile */}
      <td className="hidden lg:table-cell px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {formatChannel(customer.channel)}
      </td>

      {/* Actions - Hidden on mobile */}
      <td className="hidden lg:table-cell px-6 py-3 whitespace-nowrap text-sm text-charcoal">
        {customer.actions}
      </td>
    </tr>
  );
}
