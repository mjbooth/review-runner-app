'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Modal } from './Modal';
import {
  MessageSquare,
  Mail,
  Smartphone,
  ChevronRight,
  ChevronLeft,
  Send,
  Clock,
  Loader2,
  CheckCircle,
  CheckCircleFilled,
  Info,
  Users,
  User,
} from '@/components/ui/icons';
import { type Customer } from '@/types/database';
import { type MessageTemplate } from '../data/messageTemplates';
import { SchedulingOptions, type SchedulingConfig } from './SchedulingOptions';
import {
  reviewRequestService,
  type ReviewRequestCreationResult,
} from '../services/reviewRequestService';
import { logger } from '@/lib/logger';
import {
  personalizationVariables,
  replaceVariablesWithData,
} from '../data/personalizationVariables';

export interface CreateReviewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null; // For single customer selection
  customers?: Customer[]; // For bulk selection (full customer list)
  selectedCustomerIds?: Set<string>; // From table selection
  templates?: MessageTemplate[];
  onSend: (templateId: string, customer: Customer) => void;
  onReviewRequestsCreated?: (result: ReviewRequestCreationResult) => void;
}

interface TemplateFilters {
  search: string;
  channel: 'all' | 'SMS' | 'EMAIL';
}

interface RequestResult {
  successfulRequests: number;
  failedRequests: number;
  errors: string[];
}

type Step = 'template' | 'compose' | 'send';

export function CreateReviewRequestModal({
  isOpen,
  onClose,
  customer,
  customers,
  selectedCustomerIds,
  templates,
  onSend,
  onReviewRequestsCreated,
}: CreateReviewRequestModalProps) {
  const [step, setStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'preview' | 'edit'>('edit');
  const [currentCustomerIndex, setCurrentCustomerIndex] = useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  // Initialize selected customers based on props
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>(() => {
    if (customer) {
      // Single customer mode
      return [customer];
    } else if (customers && selectedCustomerIds) {
      // Bulk selection mode - filter customers by selected IDs
      return customers.filter(c => selectedCustomerIds.has(c.id));
    }
    return [];
  });
  const [isCreatingRequests, setIsCreatingRequests] = useState(false);
  const [requestResult, setRequestResult] = useState<RequestResult | null>(null);
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig>({
    type: 'immediate',
    timezone: 'Europe/London',
  });

  const [filters, setFilters] = useState<TemplateFilters>({
    search: '',
    channel: 'all',
  });

  // Update selected customers when props change
  useEffect(() => {
    if (customer) {
      // Single customer mode
      setSelectedCustomers([customer]);
      setCurrentCustomerIndex(0);
    } else if (customers && selectedCustomerIds) {
      // Bulk selection mode - filter customers by selected IDs
      setSelectedCustomers(customers.filter(c => selectedCustomerIds.has(c.id)));
      setCurrentCustomerIndex(0);
    } else {
      setSelectedCustomers([]);
      setCurrentCustomerIndex(0);
    }
  }, [customer, customers, selectedCustomerIds]);

  // Filter templates based on search and channel
  const filteredTemplates = useMemo(() => {
    if (!templates || templates.length === 0) return [];

    return templates.filter(template => {
      const matchesSearch =
        template.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        template.description.toLowerCase().includes(filters.search.toLowerCase());
      const matchesChannel = filters.channel === 'all' || template.channel === filters.channel;

      return matchesSearch && matchesChannel;
    });
  }, [templates, filters]);

  // Group templates by channel
  const groupedTemplates = useMemo(() => {
    const smsTemplates = filteredTemplates.filter(t => t.channel === 'SMS');
    const emailTemplates = filteredTemplates.filter(t => t.channel === 'EMAIL');

    return [
      { channel: 'EMAIL', templates: emailTemplates, displayName: 'Email' },
      { channel: 'SMS', templates: smsTemplates, displayName: 'SMS' },
    ].filter(group => group.templates.length > 0);
  }, [filteredTemplates]);

  const handleClose = useCallback(() => {
    setStep('template');
    setSelectedTemplate(null);
    setCustomMessage('');
    setPreviewMode('edit');
    setRequestResult(null);
    setSchedulingConfig({ type: 'immediate', timezone: 'Europe/London' });
    setCurrentCustomerIndex(0);
    onClose();
  }, [onClose]);

  const handleTemplateSelect = useCallback((template: MessageTemplate) => {
    setSelectedTemplate(template);
    setCustomMessage(template.content);
  }, []);

  const handleContinue = useCallback(() => {
    if (step === 'template' && selectedTemplate) {
      setStep('compose');
    } else if (step === 'compose') {
      setStep('send');
    }
  }, [step, selectedTemplate]);

  const handleBack = useCallback(() => {
    if (step === 'send') {
      setStep('compose');
    } else if (step === 'compose') {
      setStep('template');
    }
  }, [step]);

  const handleSend = useCallback(async () => {
    if (!selectedTemplate || selectedCustomers.length === 0) return;

    setIsCreatingRequests(true);
    setRequestResult(null);

    try {
      const result = await reviewRequestService.createReviewRequests(
        selectedCustomers,
        selectedTemplate,
        customMessage || selectedTemplate.content,
        selectedTemplate.subject || '',
        schedulingConfig.type === 'scheduled' ? schedulingConfig.scheduledDateTime : undefined
      );

      const requestResult = {
        successfulRequests: result.requests.length,
        failedRequests: result.failedRequests,
        errors: result.errors,
      };

      setRequestResult(requestResult);

      // Call the callback if provided
      if (onReviewRequestsCreated) {
        onReviewRequestsCreated(result);
      }
    } catch (error) {
      logger.error('Failed to create review requests', { error: String(error) });
      setRequestResult({
        successfulRequests: 0,
        failedRequests: selectedCustomers.length,
        errors: [error instanceof Error ? error.message : 'Failed to create requests'],
      });
    } finally {
      setIsCreatingRequests(false);
    }
  }, [selectedTemplate, selectedCustomers, customMessage, schedulingConfig]);

  const handleVariableClick = useCallback(
    (variableName: string) => {
      if (!textareaRef.current) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentMessage = customMessage;

      const beforeCursor = currentMessage.substring(0, start);
      const afterCursor = currentMessage.substring(end);
      const newMessage = beforeCursor + variableName + afterCursor;

      setCustomMessage(newMessage);

      // Set cursor position after the inserted variable
      setTimeout(() => {
        const newCursorPosition = start + variableName.length;
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);
        textarea.focus();
      }, 0);
    },
    [customMessage]
  );

  // Filter Bar Component
  const FilterBar = ({
    filters,
    onFilterChange,
  }: {
    filters: TemplateFilters;
    onFilterChange: (filters: TemplateFilters) => void;
  }) => (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <MessageSquare className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
        <input
          type="text"
          placeholder="Search for a template"
          value={filters.search}
          onChange={e => onFilterChange({ ...filters, search: e.target.value })}
          className="w-full h-10 pl-10 pr-4 py-2 border border-[#d1d5db] rounded-md focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] bg-white"
        />
      </div>

      {/* Channel Filter Pills */}
      <div className="bg-[#f3f4f6] rounded p-1 flex items-center space-x-1">
        <button
          onClick={() => onFilterChange({ ...filters, channel: 'all' })}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            filters.channel === 'all'
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-[#6b7280] hover:text-gray-900'
          }`}
        >
          All Channels
        </button>

        <button
          onClick={() => onFilterChange({ ...filters, channel: 'EMAIL' })}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
            filters.channel === 'EMAIL'
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-[#6b7280] hover:text-gray-900'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
            fill="#011e44"
          >
            <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z" />
          </svg>
          <span>Email</span>
        </button>

        <button
          onClick={() => onFilterChange({ ...filters, channel: 'SMS' })}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
            filters.channel === 'SMS'
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-[#6b7280] hover:text-gray-900'
          }`}
        >
          <span>💬</span>
          <span>SMS</span>
        </button>
      </div>
    </div>
  );

  // Template Card Component
  const TemplateCard = ({
    template,
    isSelected,
    onSelect,
  }: {
    template: MessageTemplate;
    isSelected: boolean;
    onSelect: (template: MessageTemplate) => void;
  }) => (
    <button
      onClick={() => onSelect(template)}
      className={`
        w-full text-left p-4 rounded-md border transition-all hover:shadow-sm min-h-[10rem] flex flex-col
        ${
          isSelected
            ? 'border-[#2563eb] bg-white ring-2 ring-blue-500/20'
            : 'border-[#dfe4ea] bg-white hover:border-[#2563eb]'
        }
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          {template.channel === 'EMAIL' ? (
            <Mail className="w-5 h-5 text-gray-600" />
          ) : (
            <MessageSquare className="w-5 h-5 text-gray-600" />
          )}
          <h3 className="font-medium text-base text-charcoal">{template.name}</h3>
        </div>
      </div>

      <p className="text-sm font-light text-[#6b7280] leading-relaxed flex-grow">
        {template.description}
      </p>

      <div className="flex items-center justify-end space-x-1 text-xs font-light text-[#6b7280] mt-2">
        <User className="w-3 h-3" />
        <span>System template</span>
      </div>
    </button>
  );

  // Step Indicator Component
  const StepIndicator = () => (
    <div className="w-80 bg-[#f0f0f0] p-6 flex flex-col h-full">
      <div className="space-y-6">
        {/* Title */}
        <div>
          <h2 className="text-xl font-bold text-charcoal">Create a review request</h2>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              {selectedCustomers.length === 1 ? (
                <User className="w-4 h-4 text-gray-600" />
              ) : (
                <Users className="w-4 h-4 text-gray-600" />
              )}
              <span className="text-sm font-medium text-gray-900">
                {selectedCustomers.length === 1
                  ? 'Customer'
                  : `Customer ${currentCustomerIndex + 1} of ${selectedCustomers.length}`}
              </span>
            </div>

            {/* Navigation controls for multiple customers */}
            {selectedCustomers.length > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentCustomerIndex(Math.max(0, currentCustomerIndex - 1))}
                  disabled={currentCustomerIndex === 0}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous customer"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  onClick={() =>
                    setCurrentCustomerIndex(
                      Math.min(selectedCustomers.length - 1, currentCustomerIndex + 1)
                    )
                  }
                  disabled={currentCustomerIndex === selectedCustomers.length - 1}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next customer"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            )}
          </div>

          {/* Always show current customer details */}
          {selectedCustomers[currentCustomerIndex] && (
            <div className="space-y-1 text-sm font-light text-[#6b7280]">
              <div>
                {selectedCustomers[currentCustomerIndex]?.firstName}{' '}
                {selectedCustomers[currentCustomerIndex]?.lastName}
              </div>
              <div>{selectedCustomers[currentCustomerIndex]?.email}</div>
              {selectedCustomers[currentCustomerIndex]?.phone && (
                <div>{selectedCustomers[currentCustomerIndex]?.phone}</div>
              )}
            </div>
          )}

          {/* Show total count for bulk */}
          {selectedCustomers.length > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                Sending to all {selectedCustomers.length} selected customers
              </div>
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {selectedTemplate && step !== 'template' ? (
              <button
                onClick={() => setStep('template')}
                className="font-medium text-base text-[#d97706] hover:text-[#b45309] cursor-pointer transition-colors text-left"
              >
                1. Select a template
              </button>
            ) : (
              <span className="font-medium text-base text-charcoal">1. Select a template</span>
            )}
            <CheckCircleFilled
              className={`w-8 h-8 ${
                selectedTemplate && step !== 'template' ? 'text-[#d97706]' : 'text-[#e5e7eb]'
              }`}
            />
          </div>

          <div className="flex items-center justify-between">
            {step === 'send' ? (
              <button
                onClick={() => setStep('compose')}
                className="font-medium text-base text-[#d97706] hover:text-[#b45309] cursor-pointer transition-colors text-left"
              >
                2. Edit the message
              </button>
            ) : (
              <span className="font-medium text-base text-charcoal">2. Edit the message</span>
            )}
            <CheckCircleFilled
              className={`w-8 h-8 ${step === 'send' ? 'text-[#d97706]' : 'text-[#e5e7eb]'}`}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium text-base text-charcoal">3. Schedule and send</span>
            <CheckCircleFilled className="w-8 h-8 text-[#e5e7eb]" />
          </div>
        </div>
      </div>

      {/* Validation Messages at Bottom */}
      <div className="mt-auto pt-4">
        {(!selectedTemplate || selectedCustomers.length === 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center space-x-2 text-amber-700 mb-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-medium">Please complete:</span>
            </div>
            <ul className="ml-6 text-xs text-amber-600 space-y-1">
              {!selectedTemplate && <li>• Select a message template</li>}
              {selectedCustomers.length === 0 && (
                <li>• Ensure at least one customer is selected</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      size="custom"
      className="w-[1116px] max-w-[90vw] max-h-[90vh] overflow-hidden bg-[#f9f7f3] rounded-2xl"
      showHeader={false}
    >
      <div className="flex h-[90vh] bg-[#f9f7f3] relative">
        {/* Left Sidebar */}
        <StepIndicator />

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#f9f7f3] pb-20">
          {step === 'template' && (
            <div className="space-y-6">
              {/* Search, Filter and Close Button Row */}
              <div className="flex items-center gap-4">
                {/* Search Input */}
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search for a template"
                    value={filters.search}
                    onChange={e => setFilters({ ...filters, search: e.target.value })}
                    className="w-full h-10 pl-10 pr-4 py-2 border border-[#d1d5db] rounded-md focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] bg-white"
                  />
                </div>

                {/* Channel Filter Pills */}
                <div className="bg-[#f3f4f6] rounded p-1 flex items-center space-x-1">
                  <button
                    onClick={() => setFilters({ ...filters, channel: 'all' })}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      filters.channel === 'all'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-[#6b7280] hover:text-gray-900'
                    }`}
                  >
                    All Channels
                  </button>

                  <button
                    onClick={() => setFilters({ ...filters, channel: 'EMAIL' })}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                      filters.channel === 'EMAIL'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-[#6b7280] hover:text-gray-900'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="24px"
                      viewBox="0 -960 960 960"
                      width="24px"
                      fill="#7C736A"
                    >
                      <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z" />
                    </svg>
                    <span>Email</span>
                  </button>

                  <button
                    onClick={() => setFilters({ ...filters, channel: 'SMS' })}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                      filters.channel === 'SMS'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-[#6b7280] hover:text-gray-900'
                    }`}
                  >
                    <span>💬</span>
                    <span>SMS</span>
                  </button>
                </div>

                {/* Close Button */}
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                  aria-label="Close modal"
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Templates Grid */}
              <div className="space-y-8">
                {groupedTemplates.map(group => (
                  <div key={group.channel}>
                    <h3 className="text-lg font-semibold text-charcoal mb-5">
                      {group.displayName} Templates [{group.templates.length}]
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      {group.templates.map(template => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          isSelected={selectedTemplate?.id === template.id}
                          onSelect={handleTemplateSelect}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                  <p className="text-gray-600">
                    Try adjusting your filters or search terms to find templates.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'compose' && selectedTemplate && (
            <div className="space-y-6">
              {/* Selected Template Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {selectedTemplate.channel === 'SMS' ? (
                      <Smartphone className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Mail className="w-5 h-5 text-green-600" />
                    )}
                    <h3 className="font-semibold text-gray-900">{selectedTemplate.name}</h3>
                  </div>
                  <button
                    onClick={() => setStep('template')}
                    className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium"
                  >
                    Change Template
                  </button>
                </div>
              </div>

              {/* Message Composition Interface */}
              <div className="space-y-4">
                {/* Tab Navigation */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setPreviewMode('edit')}
                    className={`
                      flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors
                      ${
                        previewMode === 'edit'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }
                    `}
                  >
                    Edit Message
                  </button>
                  <button
                    onClick={() => setPreviewMode('preview')}
                    className={`
                      flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors
                      ${
                        previewMode === 'preview'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }
                    `}
                  >
                    Preview
                  </button>
                </div>

                {/* Message Content */}
                {previewMode === 'edit' ? (
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Message Content
                    </label>
                    <textarea
                      ref={textareaRef}
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                      placeholder="Enter your message..."
                    />

                    {/* Message Variables Section */}
                    <h4 className="text-sm font-medium text-gray-900">Message Variables</h4>
                    <p className="text-xs text-gray-600 mb-3">
                      Click the variable below to insert into the message.
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex flex-wrap gap-2">
                        {personalizationVariables
                          .filter(
                            variable =>
                              selectedTemplate?.channel === 'EMAIL' ||
                              (selectedTemplate?.channel === 'SMS' &&
                                variable.id !== 'unsubscribeUrl')
                          )
                          .map(variable => (
                            <button
                              key={variable.id}
                              type="button"
                              onClick={() => handleVariableClick(variable.name)}
                              className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-full hover:bg-blue-600 transition-colors"
                              title={variable.description}
                            >
                              {variable.name.replace(/^\{\{(.+)\}\}$/, '{$1}')}
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Current customer indicator for multiple customers */}
                    {selectedCustomers.length > 1 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Info className="w-4 h-4 text-amber-600" />
                            <span className="text-sm text-amber-700">
                              Editing for:{' '}
                              <span className="font-medium">
                                {selectedCustomers[currentCustomerIndex]?.firstName}{' '}
                                {selectedCustomers[currentCustomerIndex]?.lastName}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() =>
                                setCurrentCustomerIndex(Math.max(0, currentCustomerIndex - 1))
                              }
                              disabled={currentCustomerIndex === 0}
                              className="p-0.5 hover:bg-amber-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Previous customer"
                            >
                              <ChevronLeft className="w-4 h-4 text-amber-600" />
                            </button>
                            <span className="text-xs text-amber-600 px-1">
                              {currentCustomerIndex + 1}/{selectedCustomers.length}
                            </span>
                            <button
                              onClick={() =>
                                setCurrentCustomerIndex(
                                  Math.min(selectedCustomers.length - 1, currentCustomerIndex + 1)
                                )
                              }
                              disabled={currentCustomerIndex === selectedCustomers.length - 1}
                              className="p-0.5 hover:bg-amber-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Next customer"
                            >
                              <ChevronRight className="w-4 h-4 text-amber-600" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-amber-600 mt-1">
                          Variables will be personalized for each customer when sent
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Message Preview
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[16rem]">
                      <div className="whitespace-pre-wrap text-gray-900">
                        {replaceVariablesWithData(
                          customMessage,
                          selectedCustomers[currentCustomerIndex] || {},
                          { name: 'Your Business Name' }
                        )}
                      </div>
                    </div>

                    {/* Customer navigation in preview mode */}
                    {selectedCustomers.length > 1 && (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="text-sm text-blue-700">
                          Preview for:{' '}
                          <span className="font-medium">
                            {selectedCustomers[currentCustomerIndex]?.firstName}{' '}
                            {selectedCustomers[currentCustomerIndex]?.lastName}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() =>
                              setCurrentCustomerIndex(Math.max(0, currentCustomerIndex - 1))
                            }
                            disabled={currentCustomerIndex === 0}
                            className="px-3 py-1 text-sm bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ← Previous
                          </button>
                          <span className="text-sm text-blue-600">
                            {currentCustomerIndex + 1} / {selectedCustomers.length}
                          </span>
                          <button
                            onClick={() =>
                              setCurrentCustomerIndex(
                                Math.min(selectedCustomers.length - 1, currentCustomerIndex + 1)
                              )
                            }
                            disabled={currentCustomerIndex === selectedCustomers.length - 1}
                            className="px-3 py-1 text-sm bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'send' && selectedTemplate && (
            <div className="space-y-6">
              {/* Send Summary Header */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Ready to {schedulingConfig.type === 'immediate' ? 'Send' : 'Schedule'} Review
                  Requests
                </h2>
                <p className="text-gray-600">
                  Review your message details below and click "
                  {schedulingConfig.type === 'immediate' ? 'Send Now' : 'Schedule'}" to{' '}
                  {schedulingConfig.type === 'immediate'
                    ? 'send your review requests'
                    : 'schedule your review requests'}
                  .
                </p>
              </div>

              {/* Scheduling Options */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <SchedulingOptions config={schedulingConfig} onChange={setSchedulingConfig} />
              </div>

              {/* Request Results */}
              {requestResult && (
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Results</h3>

                  {requestResult.successfulRequests > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center space-x-2 text-green-700">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">
                          Successfully created {requestResult.successfulRequests} review request
                          {requestResult.successfulRequests !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {requestResult.failedRequests > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 text-red-700 mb-2">
                        <Info className="w-5 h-5" />
                        <span className="font-medium">
                          {requestResult.failedRequests} request
                          {requestResult.failedRequests !== 1 ? 's' : ''} failed
                        </span>
                      </div>
                      {requestResult.errors.length > 0 && (
                        <ul className="mt-2 ml-7 text-sm text-red-600 space-y-1">
                          {requestResult.errors.map((error, index) => (
                            <li key={index}>• {error}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed Continue Button */}
        <div className="absolute bottom-0 right-0 left-80 bg-[#f9f7f3] p-3">
          <div className="flex justify-between items-center px-3">
            <button
              onClick={handleClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>

            <button
              onClick={() => {
                if (step === 'template' && selectedTemplate) {
                  handleContinue();
                } else if (step === 'compose') {
                  handleContinue();
                } else if (step === 'send') {
                  handleSend();
                }
              }}
              disabled={
                (step === 'template' && (!selectedTemplate || selectedCustomers.length === 0)) ||
                (step === 'send' && (isCreatingRequests || selectedCustomers.length === 0))
              }
              className={`
                px-6 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors
                ${
                  (step === 'template' && selectedTemplate && selectedCustomers.length > 0) ||
                  step === 'compose' ||
                  (step === 'send' && !isCreatingRequests && selectedCustomers.length > 0)
                    ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                }
              `}
            >
              {isCreatingRequests ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {step === 'send' && schedulingConfig.type === 'immediate'
                      ? 'Sending...'
                      : 'Creating...'}
                  </span>
                </>
              ) : (
                <>
                  {step === 'send' ? (
                    <>
                      {schedulingConfig.type === 'immediate' ? (
                        <Send className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      <span>{schedulingConfig.type === 'immediate' ? 'Send Now' : 'Schedule'}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {step === 'template'
                          ? 'Continue'
                          : step === 'compose'
                            ? 'Continue to Schedule'
                            : 'Continue'}
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
