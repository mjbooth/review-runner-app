'use client';

import React, { useState } from 'react';
import { type Customer } from '../types';
import { Modal } from './Modal';
import { formatName } from '../utils';

interface CustomerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  mode: 'create' | 'edit';
  onSave: (customer: Customer) => void | Promise<void>;
  onCreate?: (customerData: Partial<Customer>) => Promise<Customer | null>;
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

function FormField({ label, required = false, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-charcoal">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Default form data for clean state
const getDefaultFormData = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  channel: 'email' as const,
  suppressed: 'active' as const,
});

export function CustomerEditModal({
  isOpen,
  onClose,
  customer,
  mode,
  onSave,
  onCreate,
}: CustomerEditModalProps) {
  const [formData, setFormData] = useState(getDefaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Update form data when modal opens or mode/customer changes
  React.useEffect(() => {
    if (!isOpen) return; // Only reset when modal is actually open

    if (mode === 'create') {
      // Reset form for new customer
      setFormData(getDefaultFormData());
      setErrors({});
    } else if (customer) {
      // Load existing customer data for editing
      setFormData({
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        channel: customer.channel || 'email',
        suppressed: customer.suppressed,
      });
      setErrors({});
    }
  }, [isOpen, customer, mode]); // Add isOpen to dependencies

  // Reset form when modal closes completely
  React.useEffect(() => {
    if (!isOpen) {
      // Small delay to ensure modal closing animation doesn't show stale data
      const resetTimer = setTimeout(() => {
        setFormData(getDefaultFormData());
        setErrors({});
        setIsSaving(false);
        setApiError(null);
      }, 150);

      return () => clearTimeout(resetTimer);
    }
  }, [isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    // For MVP, at least one contact method is required
    const hasEmail = formData.email.trim();
    const hasPhone = formData.phone.trim();

    if (!hasEmail && !hasPhone) {
      newErrors.email = 'Either email or phone number is required';
      newErrors.phone = 'Either email or phone number is required';
    } else {
      // Validate email if provided
      if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }

      // Validate phone if provided
      if (hasPhone && !/^[0-9]{10,11}$/.test(formData.phone.replace(/\s/g, ''))) {
        newErrors.phone = 'Please enter a valid UK phone number (10-11 digits)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    setApiError(null);
    try {
      if (mode === 'create') {
        // Create new customer
        if (!onCreate) {
          console.error('onCreate function not provided for create mode');
          return;
        }

        const newCustomer = await onCreate({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim().toLowerCase() || '',
          phone: formData.phone.replace(/\s/g, '') || '', // Store without spaces
        });

        if (newCustomer) {
          // Reset form state after successful creation
          setFormData(getDefaultFormData());
          setErrors({});
          onClose();
        }
      } else {
        // Update existing customer - only send changed fields
        if (!customer) return;

        const updatedData: Partial<Customer> = {};

        // Compare and only include changed fields
        const newFirstName = formData.firstName.trim();
        const newLastName = formData.lastName.trim() || null;
        const newEmail = formData.email.trim().toLowerCase() || null;
        const newPhone = formData.phone.replace(/\s/g, '') || null;

        if (newFirstName !== customer.firstName) {
          updatedData.firstName = newFirstName;
        }
        if (newLastName !== customer.lastName) {
          updatedData.lastName = newLastName;
        }
        if (newEmail !== customer.email) {
          updatedData.email = newEmail;
        }
        if (newPhone !== customer.phone) {
          updatedData.phone = newPhone;
        }

        // Only proceed if there are actual changes
        if (Object.keys(updatedData).length === 0) {
          onClose();
          return;
        }

        const fullUpdatedCustomer: Customer = {
          ...customer,
          ...updatedData,
          updatedAt: new Date().toISOString(),
        };

        await onSave(fullUpdatedCustomer);
        onClose();
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      setApiError(error instanceof Error ? error.message : 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form state when cancelling
    setFormData(getDefaultFormData());
    setErrors({});
    setIsSaving(false);
    setApiError(null);
    onClose();
  };

  if (mode === 'edit' && !customer) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New Customer' : 'Edit Customer'}
      size="lg"
    >
      <div className="space-y-6">
        {/* Customer Header */}
        {mode === 'edit' && customer && (
          <div className="bg-basewarm-50 rounded-lg p-4 border border-basewarm-200">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-forgedorange-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold">
                  {formatName(customer.firstName).charAt(0)}
                  {formatName(customer.lastName).charAt(0)}
                </span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-charcoal">
                  Editing: {formatName(customer.firstName)} {formatName(customer.lastName)}
                </h3>
                <p className="text-sm text-gray-500">Customer ID: {customer.id}</p>
              </div>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-forgedorange-50 rounded-lg p-4 border border-forgedorange-200">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-forgedorange-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">+</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-charcoal">Add New Customer</h3>
                <p className="text-sm text-gray-500">
                  Enter customer details to begin managing review requests
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Two-column form layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Personal Information */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-charcoal border-b border-gray-200 pb-2">
              Personal Information
            </h4>

            <FormField label="First Name" required error={errors.firstName}>
              <input
                type="text"
                value={formData.firstName}
                onChange={e => handleInputChange('firstName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
                placeholder="Enter first name"
              />
            </FormField>

            <FormField label="Last Name" error={errors.lastName}>
              <input
                type="text"
                value={formData.lastName}
                onChange={e => handleInputChange('lastName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
                placeholder="Enter last name"
              />
            </FormField>
          </div>

          {/* Right Column - Contact Information */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-charcoal border-b border-gray-200 pb-2">
              Contact Information
            </h4>

            <FormField label="Email Address" error={errors.email}>
              <input
                type="email"
                value={formData.email}
                onChange={e => handleInputChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
                placeholder="Enter email address"
              />
            </FormField>

            <FormField label="Phone Number" error={errors.phone}>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => handleInputChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
                placeholder="07123456789"
              />
            </FormField>
          </div>
        </div>

        {/* Settings - only show for edit mode */}
        {mode === 'edit' && (
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-charcoal border-b border-gray-200 pb-2">
              Settings
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Preferred Channel">
                <select
                  value={formData.channel}
                  onChange={e => handleInputChange('channel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </FormField>

              <FormField label="Status">
                <select
                  value={formData.suppressed}
                  onChange={e => handleInputChange('suppressed', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
                >
                  <option value="active">Active</option>
                  <option value="suppressed">Suppressed</option>
                </select>
              </FormField>
            </div>
          </div>
        )}

        {/* Error Message */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{apiError}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm font-medium"
          >
            Cancel
          </button>

          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-white border border-gray-300 text-charcoal rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-forgedorange-600 text-white rounded-lg hover:bg-forgedorange-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Saving...'
                : mode === 'create'
                  ? 'Create Customer'
                  : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
