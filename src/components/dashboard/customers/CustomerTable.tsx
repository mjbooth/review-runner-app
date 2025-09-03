'use client';

import React, { useState, useCallback } from 'react';
import type { CustomerTableProps, Customer } from './types';
import { CustomerRow } from './CustomerRow';
import { CustomerMobileCard } from './CustomerMobileCard';
import { ColumnHeader } from './components/ColumnHeader';
import { EmptyState } from './components/EmptyState';
import { TableHeader, type FilterValues } from './components/TableHeader';
import { ContextMenu } from './components/ContextMenu';
import { CustomerDetailsModal } from './components/CustomerDetailsModal';
import { CustomerEditModal } from './components/CustomerEditModal';
import { CustomerNotesModal } from './components/CustomerNotesModal';
import { CustomerAnalyticsModal } from './components/CustomerAnalyticsModal';
import { CustomerHistoryModal } from '@/components/customers/CustomerHistoryModal';
import { CustomerTagsModal } from './components/CustomerTagsModal';
import { ErrorDetailsModal } from './components/ErrorDetailsModal';
import { RequestDetailsModal } from './components/RequestDetailsModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { Pagination } from './components/Pagination';
import { customerTableColumns } from './utils';
import { useContextMenu } from './hooks/useContextMenu';
import { useCustomerModals } from './hooks/useCustomerModals';

export function CustomerTable({
  className = '',
  customers,
  onCustomerSelect,
  onSelectionChange,
  searchQuery = '',
  onSearchChange,
  onCreateCustomer,
  onUpdateCustomer,
  onOpenCreateModal,
  onSendReviewRequest,
  searching = false,
}: CustomerTableProps): React.ReactElement {
  // customers prop contains live data from API
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Filter state
  const [filters, setFilters] = useState<FilterValues>({
    status: [],
    channel: [],
    suppressed: [],
    dateAdded: '',
    lastRequest: '',
  });

  // Customer modals hook
  const {
    detailsModal,
    openDetailsModal,
    closeDetailsModal,
    editModal,
    openEditModal,
    openCreateModal,
    closeEditModal,
    handleCustomerSave,
    notesModal,
    openNotesModal,
    closeNotesModal,
    analyticsModal,
    openAnalyticsModal,
    closeAnalyticsModal,
    historyModal,
    openHistoryModal,
    closeHistoryModal,
    tagsModal,
    openTagsModal,
    closeTagsModal,
    errorDetailsModal,
    openErrorDetailsModal,
    closeErrorDetailsModal,
    requestDetailsModal,
    openRequestDetailsModal,
    closeRequestDetailsModal,
  } = useCustomerModals({ updateCustomer: onUpdateCustomer });

  // Context menu hook
  const {
    contextMenu,
    handleContextMenu,
    handleCloseContextMenu,
    handleContextMenuAction,
    confirmation,
    hideConfirmation,
    handleConfirm,
  } = useContextMenu({
    onViewDetails: openDetailsModal,
    onEditCustomer: openEditModal,
    onSendReviewRequest: onSendReviewRequest,
    onShowNotes: openNotesModal,
    onShowAnalytics: openAnalyticsModal,
    onShowHistory: openHistoryModal,
    onManageTags: openTagsModal,
    onShowErrorDetails: openErrorDetailsModal,
    onShowRequestDetails: customer => openRequestDetailsModal(customer),
    onScheduleReview: onSendReviewRequest, // Use same handler for scheduling
    onRefreshData: () => window.location.reload(), // Simple refresh for now
  });

  // Helper functions for date filtering
  const isSameDay = (date1: Date, date2: Date) => {
    return date1.toDateString() === date2.toDateString();
  };

  const isWithinDays = (date: Date, referenceDate: Date, days: number) => {
    const diffTime = referenceDate.getTime() - date.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= days && diffDays >= 0;
  };

  // Apply filters and search
  const filteredCustomers = customers.filter(customer => {
    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const searchableFields = [
        customer.firstName.toLowerCase(),
        customer.lastName.toLowerCase(),
        `${customer.firstName} ${customer.lastName}`.toLowerCase(),
        customer.email.toLowerCase(),
        customer.phone.toLowerCase(),
        customer.status.toLowerCase(),
        customer.channel?.toLowerCase() || '',
      ];

      if (!searchableFields.some(field => field.includes(query))) {
        return false;
      }
    }

    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(customer.status)) {
      return false;
    }

    // Channel filter
    if (filters.channel.length > 0 && !filters.channel.includes(customer.channel || '')) {
      return false;
    }

    // Suppressed filter
    if (filters.suppressed.length > 0 && !filters.suppressed.includes(customer.suppressed)) {
      return false;
    }

    // Date added filter
    if (filters.dateAdded) {
      const customerDate = new Date(customer.dateAdded);
      const now = new Date();

      switch (filters.dateAdded) {
        case 'today':
          if (!isSameDay(customerDate, now)) return false;
          break;
        case 'week':
          if (!isWithinDays(customerDate, now, 7)) return false;
          break;
        case 'month':
          if (!isWithinDays(customerDate, now, 30)) return false;
          break;
        case '3months':
          if (!isWithinDays(customerDate, now, 90)) return false;
          break;
      }
    }

    // Last request filter
    if (filters.lastRequest) {
      switch (filters.lastRequest) {
        case 'has-request':
          if (!customer.lastRequest) return false;
          break;
        case 'no-request':
          if (customer.lastRequest) return false;
          break;
      }
    }

    return true;
  });

  // Pagination calculations
  const totalCustomers = filteredCustomers.length;
  const totalPages = Math.ceil(totalCustomers / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

  // Calculate active filters count
  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.status.length > 0) count++;
    if (filters.channel.length > 0) count++;
    if (filters.suppressed.length > 0) count++;
    if (filters.dateAdded) count++;
    if (filters.lastRequest) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  // Reset to first page when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters]);

  // Handle row selection
  const handleRowSelect = useCallback(
    (customerId: string) => {
      setSelectedRows(prev => {
        const newSelected = new Set(prev);
        if (newSelected.has(customerId)) {
          newSelected.delete(customerId);
        } else {
          newSelected.add(customerId);
        }

        // Defer the callback to avoid state updates during render
        setTimeout(() => {
          onSelectionChange?.(newSelected);
        }, 0);

        return newSelected;
      });
    },
    [onSelectionChange]
  );

  // Handle select all
  const handleSelectAll = useCallback(() => {
    const newSelected =
      selectedRows.size === paginatedCustomers.length
        ? new Set<string>()
        : new Set(paginatedCustomers.map(c => c.id));
    setSelectedRows(newSelected);

    // Defer the callback to avoid state updates during render
    setTimeout(() => {
      onSelectionChange?.(newSelected);
    }, 0);
  }, [paginatedCustomers, selectedRows.size, onSelectionChange]);

  // Handle sorting
  const handleSort = useCallback(
    (column: string) => {
      if (sortColumn === column) {
        setSortDirection(prev => {
          if (prev === 'asc') return 'desc';
          if (prev === 'desc') return null;
          return 'asc';
        });
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn]
  );

  // Check if we're on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const shouldShowCards = viewMode === 'cards' || isMobile;

  // Empty state
  if (totalCustomers === 0) {
    const hasFiltersOrSearch = searchQuery.trim() || activeFiltersCount > 0;
    const isFilteredEmpty = customers.length > 0 && hasFiltersOrSearch;

    return (
      <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
        <TableHeader
          searchQuery={searchQuery}
          onSearchChange={onSearchChange || (() => {})}
          totalCount={totalCustomers}
          onFiltersChange={setFilters}
          activeFiltersCount={activeFiltersCount}
          searching={searching}
        />
        <EmptyState
          title={isFilteredEmpty ? 'No customers match your criteria' : 'No customers found'}
          description={
            isFilteredEmpty
              ? "Try adjusting your search or filters to find what you're looking for."
              : 'Get started by adding your first customer to begin managing review requests.'
          }
          actionLabel={isFilteredEmpty ? 'Clear Filters' : 'Add Customer'}
          onAction={
            isFilteredEmpty
              ? () => {
                  // Clear all filters and search
                  onSearchChange?.('');
                  setFilters({
                    status: [],
                    channel: [],
                    suppressed: [],
                    dateAdded: '',
                    lastRequest: '',
                  });
                }
              : undefined
          }
        />
      </div>
    );
  }

  // Mobile/Card view
  if (shouldShowCards) {
    return (
      <div className={className}>
        <div className="bg-white border border-gray-200 rounded-t-lg">
          <TableHeader
            searchQuery={searchQuery}
            onSearchChange={onSearchChange || (() => {})}
            totalCount={totalCustomers}
            onFiltersChange={setFilters}
            activeFiltersCount={activeFiltersCount}
            searching={searching}
          />
        </div>
        <div className="space-y-3 mt-4">
          {paginatedCustomers.map(customer => (
            <CustomerMobileCard
              key={customer.id}
              customer={customer}
              selected={selectedRows.has(customer.id)}
              onSelect={handleRowSelect}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>

        {/* Mobile Pagination */}
        <div className="bg-white border border-gray-200 rounded-b-lg">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCustomers}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>

        {/* Context Menu for Mobile View */}
        <ContextMenu
          isVisible={contextMenu.isVisible}
          x={contextMenu.x}
          y={contextMenu.y}
          customer={contextMenu.customer}
          onClose={handleCloseContextMenu}
          onAction={handleContextMenuAction}
        />

        {/* Customer Details Modal */}
        <CustomerDetailsModal
          isOpen={detailsModal.isOpen}
          onClose={closeDetailsModal}
          customer={detailsModal.customer}
        />

        {/* Customer Edit Modal */}
        <CustomerEditModal
          isOpen={editModal.isOpen}
          onClose={closeEditModal}
          customer={editModal.customer}
          mode={editModal.mode}
          onSave={handleCustomerSave}
          onCreate={onCreateCustomer}
        />

        {/* Customer Notes Modal */}
        <CustomerNotesModal
          isOpen={notesModal.isOpen}
          onClose={closeNotesModal}
          customer={notesModal.customer}
        />

        {/* Customer Analytics Modal */}
        <CustomerAnalyticsModal
          isOpen={analyticsModal.isOpen}
          onClose={closeAnalyticsModal}
          customer={analyticsModal.customer}
        />

        {/* Customer History Modal */}
        <CustomerHistoryModal
          isOpen={historyModal.isOpen}
          onClose={closeHistoryModal}
          customer={historyModal.customer}
        />

        {/* Customer Tags Modal */}
        <CustomerTagsModal
          isOpen={tagsModal.isOpen}
          onClose={closeTagsModal}
          customer={tagsModal.customer}
        />

        {/* Error Details Modal */}
        <ErrorDetailsModal
          isOpen={errorDetailsModal.isOpen}
          onClose={closeErrorDetailsModal}
          customer={errorDetailsModal.customer}
        />

        {/* Request Details Modal */}
        <RequestDetailsModal
          isOpen={requestDetailsModal.isOpen}
          onClose={closeRequestDetailsModal}
          customer={requestDetailsModal.customer}
          requestId={requestDetailsModal.requestId}
        />

        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={confirmation.isOpen}
          onClose={hideConfirmation}
          onConfirm={handleConfirm}
          title={confirmation.title}
          message={confirmation.message}
          details={confirmation.details}
          type={confirmation.type}
          confirmText={confirmation.confirmText}
          cancelText={confirmation.cancelText}
          requireDoubleConfirm={confirmation.requireDoubleConfirm}
          customerName={confirmation.customerName}
        />
      </div>
    );
  }

  // Desktop table view
  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm ${className}`}
    >
      <TableHeader
        searchQuery={searchQuery}
        onSearchChange={onSearchChange || (() => {})}
        totalCount={totalCustomers}
        onFiltersChange={setFilters}
        activeFiltersCount={activeFiltersCount}
        searching={searching}
      />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {/* Select all checkbox */}
              <th className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <input
                  type="checkbox"
                  checked={
                    paginatedCustomers.length > 0 && selectedRows.size === paginatedCustomers.length
                  }
                  ref={input => {
                    if (input) {
                      input.indeterminate =
                        selectedRows.size > 0 && selectedRows.size < paginatedCustomers.length;
                    }
                  }}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-forgedorange-600 border-gray-300 rounded focus:ring-forgedorange-500"
                />
              </th>

              {/* Column headers */}
              {customerTableColumns.map(column => (
                <ColumnHeader
                  key={column.key}
                  label={column.label}
                  sortable={column.sortable}
                  sortDirection={sortColumn === column.key ? sortDirection : null}
                  onSort={() => column.sortable && handleSort(column.key)}
                  className={`
                    ${column.mobileHidden ? 'hidden md:table-cell' : ''}
                    ${column.className || ''}
                  `}
                />
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedCustomers.map(customer => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                selected={selectedRows.has(customer.id)}
                onSelect={handleRowSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Desktop Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCustomers}
        itemsPerPage={pageSize}
        onPageChange={setCurrentPage}
      />

      {/* Context Menu */}
      <ContextMenu
        isVisible={contextMenu.isVisible}
        x={contextMenu.x}
        y={contextMenu.y}
        customer={contextMenu.customer}
        onClose={handleCloseContextMenu}
        onAction={handleContextMenuAction}
      />

      {/* Customer Details Modal */}
      <CustomerDetailsModal
        isOpen={detailsModal.isOpen}
        onClose={closeDetailsModal}
        customer={detailsModal.customer}
      />

      {/* Customer Edit Modal */}
      <CustomerEditModal
        isOpen={editModal.isOpen}
        onClose={closeEditModal}
        customer={editModal.customer}
        mode={editModal.mode}
        onSave={handleCustomerSave}
        onCreate={onCreateCustomer}
      />

      {/* Customer Notes Modal */}
      <CustomerNotesModal
        isOpen={notesModal.isOpen}
        onClose={closeNotesModal}
        customer={notesModal.customer}
      />

      {/* Customer Analytics Modal */}
      <CustomerAnalyticsModal
        isOpen={analyticsModal.isOpen}
        onClose={closeAnalyticsModal}
        customer={analyticsModal.customer}
      />

      {/* Customer History Modal */}
      <CustomerHistoryModal
        isOpen={historyModal.isOpen}
        onClose={closeHistoryModal}
        customer={historyModal.customer}
      />

      {/* Customer Tags Modal */}
      <CustomerTagsModal
        isOpen={tagsModal.isOpen}
        onClose={closeTagsModal}
        customer={tagsModal.customer}
      />

      {/* Error Details Modal */}
      <ErrorDetailsModal
        isOpen={errorDetailsModal.isOpen}
        onClose={closeErrorDetailsModal}
        customer={errorDetailsModal.customer}
      />

      {/* Request Details Modal */}
      <RequestDetailsModal
        isOpen={requestDetailsModal.isOpen}
        onClose={closeRequestDetailsModal}
        customer={requestDetailsModal.customer}
        requestId={requestDetailsModal.requestId}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={hideConfirmation}
        onConfirm={handleConfirm}
        title={confirmation.title}
        message={confirmation.message}
        details={confirmation.details}
        type={confirmation.type}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        requireDoubleConfirm={confirmation.requireDoubleConfirm}
        customerName={confirmation.customerName}
      />
    </div>
  );
}
