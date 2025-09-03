'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { BusinessSearchStep } from '@/components/onboarding/BusinessSearchStep';
import { UserProfileStep } from '@/components/onboarding/UserProfileStep';
import { type BusinessData } from '@/components/onboarding/BusinessPreviewCard';
import { useOnboardingContext } from '@/contexts/OnboardingContext';
import { useOnboarding, type StepValidationFunction } from '@/hooks/useOnboarding';
import {
  MessageSquare,
  Mail,
  User,
  Smartphone,
  Send,
  Clock,
  Loader2,
  CheckCircle,
} from '@/components/ui/icons';
import {
  MESSAGE_TEMPLATES,
  type MessageTemplate,
  type MessageChannel,
} from '@/components/dashboard/customers/data/messageTemplates';
import {
  personalizationVariables,
  replaceVariablesWithData,
} from '@/components/dashboard/customers/data/personalizationVariables';
import {
  SchedulingOptions,
  type SchedulingConfig,
} from '@/components/dashboard/customers/components/SchedulingOptions';

interface DashboardOnboardingModalProps {
  isOpen: boolean;
  onComplete?: () => void;
}

export function DashboardOnboardingModal({ isOpen, onComplete }: DashboardOnboardingModalProps) {
  const { profile, updateOnboarding, completeOnboardingFlow } = useOnboardingContext();

  // Monitor modal state changes for debugging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Onboarding] Modal state changed:', {
        isOpen,
        profileStatus: profile?.status,
        currentStep: profile?.currentStep,
      });
    }
  }, [isOpen, profile]);

  // Local state for onboarding data
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessData | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [templateFilters, setTemplateFilters] = useState({
    search: '',
    channel: 'all' as 'all' | MessageChannel,
  });
  const [customMessage, setCustomMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'preview' | 'edit'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig>({
    type: 'immediate',
    timezone: 'Europe/London',
  });
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const [requestResult, setRequestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  // Initialize onboarding hook with current status
  const initialStatus = profile?.status || 'pending';
  const initialStep = profile?.currentStep || 0;
  const initialCompletedSteps = profile?.completedSteps || [];

  // Memoize options to prevent infinite re-renders
  const onboardingOptions = useMemo(
    () => ({
      initialStep,
      initialCompletedSteps,
    }),
    [initialStep, initialCompletedSteps]
  );

  const {
    isOpen: hookIsOpen,
    currentStep,
    totalSteps,
    onboardingStatus,
    steps,
    completedSteps,
    isLoading,
    canGoBack,
    canGoNext,
    isFirstStep,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    completeOnboarding: hookCompleteOnboarding,
  } = useOnboarding(initialStatus, onboardingOptions);

  // Custom complete onboarding function that also closes the modal
  const completeOnboarding = async () => {
    await hookCompleteOnboarding();
    onComplete?.();
  };

  // Filter templates based on search and channel
  const filteredTemplates = useMemo(() => {
    return MESSAGE_TEMPLATES.filter(template => {
      if (!template.isActive) return false;

      const matchesSearch =
        template.name.toLowerCase().includes(templateFilters.search.toLowerCase()) ||
        template.description.toLowerCase().includes(templateFilters.search.toLowerCase());
      const matchesChannel =
        templateFilters.channel === 'all' || template.channel === templateFilters.channel;

      return matchesSearch && matchesChannel;
    });
  }, [templateFilters]);

  // Group templates by channel
  const groupedTemplates = useMemo(() => {
    const smsTemplates = filteredTemplates.filter(t => t.channel === 'SMS');
    const emailTemplates = filteredTemplates.filter(t => t.channel === 'EMAIL');

    return [
      { channel: 'EMAIL', templates: emailTemplates, displayName: 'Email' },
      { channel: 'SMS', templates: smsTemplates, displayName: 'SMS' },
    ].filter(group => group.templates.length > 0);
  }, [filteredTemplates]);

  // Template selection handlers
  const handleTemplateSelect = useCallback((template: MessageTemplate) => {
    console.log('[Onboarding] Template selected:', {
      id: template.id,
      name: template.name,
      channel: template.channel,
      contentLength: template.content.length,
    });
    setSelectedTemplate(template);
    setCustomMessage(template.content);
  }, []);

  // Variable click handler for message composition
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

  // Handle sending the review request
  const handleSendRequest = useCallback(async () => {
    // Prevent duplicate submissions
    if (isCreatingRequest) {
      console.warn('[Onboarding] Request already in progress, ignoring duplicate click');
      return;
    }

    console.log('[Onboarding] Starting review request send process:', {
      hasTemplate: !!selectedTemplate,
      templateId: selectedTemplate?.id,
      customerName,
      customerEmail,
      customerPhone,
      schedulingConfig,
    });

    if (!selectedTemplate || !customerName.trim()) {
      console.error('[Onboarding] Missing required data:', {
        template: !!selectedTemplate,
        customerName: !!customerName.trim(),
      });
      return;
    }

    setIsCreatingRequest(true);
    setRequestResult(null);

    try {
      // Step 1: Get current business data to access googleReviewUrl
      console.log('[Onboarding] Step 1: Fetching business data...');
      const businessResponse = await fetch('/api/businesses/current', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      let reviewUrl = 'https://g.page/your-business/review'; // Fallback
      if (businessResponse.ok) {
        const { data: businessData } = await businessResponse.json();
        if (businessData?.googleReviewUrl) {
          reviewUrl = businessData.googleReviewUrl;
        }
        console.log('[Onboarding] Business data retrieved:', {
          id: businessData?.id,
          name: businessData?.name,
          hasGoogleReviewUrl: !!businessData?.googleReviewUrl,
          reviewUrl,
        });
      } else {
        const errorData = await businessResponse.text();
        console.error('[Onboarding] Failed to fetch business data:', {
          status: businessResponse.status,
          error: errorData,
        });
        console.warn('[Onboarding] Using fallback review URL');
      }

      // Step 2: Create the customer
      const customerData = {
        firstName: customerName.split(' ')[0] || customerName,
        lastName: customerName.split(' ').slice(1).join(' ') || '',
        email: customerEmail.trim() || undefined,
        phone: customerPhone.trim() || undefined,
        tags: ['onboarding', 'first-customer'],
      };

      console.log('[Onboarding] Step 2: Creating customer with data:', customerData);

      const customerResponse = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerData),
      });

      if (!customerResponse.ok) {
        const error = await customerResponse.json();
        console.error('[Onboarding] Customer creation failed:', {
          status: customerResponse.status,
          error: error.error,
          details: error,
        });
        throw new Error(error.error?.message || 'Failed to create customer');
      }

      const { data: customer } = await customerResponse.json();
      console.log('[Onboarding] Customer created successfully:', {
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName}`,
        email: customer.email,
        phone: customer.phone,
      });

      // Step 3: Create the review request
      const reviewRequestData = {
        customerId: customer.id,
        templateId: selectedTemplate.id,
        channel: selectedTemplate.channel.toUpperCase(), // API expects uppercase
        subject: selectedTemplate.subject,
        messageContent: customMessage, // API expects 'messageContent' not 'content'
        reviewUrl: reviewUrl, // Get from business API
        scheduledFor:
          schedulingConfig.type === 'scheduled' && schedulingConfig.scheduledDateTime
            ? new Date(schedulingConfig.scheduledDateTime).toISOString()
            : undefined, // Must be ISO string or undefined (not null)
      };

      console.log('[Onboarding] Step 3: Creating review request with data:', reviewRequestData);

      const requestResponse = await fetch('/api/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewRequestData),
      });

      if (!requestResponse.ok) {
        const error = await requestResponse.json();
        console.error('[Onboarding] Review request creation failed:', {
          status: requestResponse.status,
          error: error.error,
          details: error,
        });
        throw new Error(error.error?.message || 'Failed to create review request');
      }

      const { data: reviewRequest } = await requestResponse.json();
      console.log('[Onboarding] Review request created successfully:', {
        id: reviewRequest.id,
        status: reviewRequest.status,
        channel: reviewRequest.channel,
        scheduledFor: reviewRequest.scheduledFor,
      });

      setRequestResult({
        success: true,
        message: `Review request ${schedulingConfig.type === 'immediate' ? 'sent' : 'scheduled'} successfully!`,
      });
    } catch (error) {
      console.error('Failed to create review request:', error);
      setRequestResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create review request. Please try again.',
      });
    } finally {
      setIsCreatingRequest(false);
    }
  }, [
    selectedTemplate,
    customerName,
    customerEmail,
    customerPhone,
    customMessage,
    schedulingConfig,
    isCreatingRequest,
  ]);

  // Validation function for each step
  const validateCurrentStep: StepValidationFunction = useCallback(async () => {
    console.log('[Onboarding] Validating step:', {
      currentStep,
      stepName: steps[currentStep]?.title,
      completedSteps,
    });

    switch (currentStep) {
      case 0: // Business Setup (was Step 1)
        console.log('[Onboarding] Step 0: Validating business setup:', {
          hasSelectedBusiness: !!selectedBusiness,
          businessName: selectedBusiness?.name,
        });

        if (!selectedBusiness) {
          console.warn('[Onboarding] Step 0 validation failed: No business selected');
          alert('Please select your business or enter your details manually to continue.');
          return false;
        }

        // Update onboarding with business data
        console.log('[Onboarding] Step 0: Updating business data...');
        await updateOnboarding({
          currentStep: 1,
          completedSteps: [...completedSteps, 0],
          businessData: {
            name: selectedBusiness.name,
            address: selectedBusiness.address,
            phone: selectedBusiness.phone,
            website: selectedBusiness.website,
            placeId: selectedBusiness.placeId,
            googleMapsUrl: selectedBusiness.googleMapsUrl,
          },
        });

        console.log('[Onboarding] Step 0: Business data saved successfully');
        return true;

      case 1: // Add Customer (was Step 2)
        console.log('[Onboarding] Step 1: Validating customer data:', {
          customerName,
          hasEmail: !!customerEmail.trim(),
          hasPhone: !!customerPhone.trim(),
        });

        if (!customerName.trim()) {
          console.warn('[Onboarding] Step 1 validation failed: No customer name');
          alert('Please enter a customer name to continue.');
          return false;
        }

        // At this step, template isn't selected yet, so just require at least one contact method
        if (!customerEmail.trim() && !customerPhone.trim()) {
          console.warn('[Onboarding] Step 1 validation failed: No contact method');
          alert('Please enter either an email address or phone number for the customer.');
          return false;
        }

        // Update onboarding with customer data
        console.log('[Onboarding] Step 1: Saving customer data...');
        await updateOnboarding({
          currentStep: 2,
          completedSteps: [...completedSteps, 1],
          customerData: {
            firstName: customerName.split(' ')[0] || customerName,
            lastName: customerName.split(' ').slice(1).join(' ') || '',
            email: customerEmail.trim() || undefined,
            phone: customerPhone.trim() || undefined,
          },
        });

        console.log('[Onboarding] Step 1: Customer data saved successfully');
        return true;

      case 2: // Template Selection
        console.log('[Onboarding] Step 2: Validating template selection:', {
          hasSelectedTemplate: !!selectedTemplate,
          templateId: selectedTemplate?.id,
          templateName: selectedTemplate?.name,
        });

        if (!selectedTemplate) {
          console.warn('[Onboarding] Step 2 validation failed: No template selected');
          alert('Please select a message template to continue.');
          return false;
        }

        // Update onboarding with template data
        console.log('[Onboarding] Step 2: Saving template selection...');
        await updateOnboarding({
          currentStep: 3,
          completedSteps: [...completedSteps, 2],
          templateData: {
            templateId: selectedTemplate.id,
            templateName: selectedTemplate.name,
            channel: selectedTemplate.channel,
            content: selectedTemplate.content,
            subject: selectedTemplate.subject,
          },
        });

        console.log('[Onboarding] Step 2: Template selection saved successfully');
        return true;

      case 3: // Review Message
        console.log('[Onboarding] Step 3: Validating message content:', {
          messageLength: customMessage.length,
          hasContent: !!customMessage.trim(),
          previewMode,
        });

        if (!customMessage.trim()) {
          console.warn('[Onboarding] Step 3 validation failed: No message content');
          alert('Please enter a message to continue.');
          return false;
        }

        // Update onboarding with custom message data
        console.log('[Onboarding] Step 3: Saving message content...');
        await updateOnboarding({
          currentStep: 4,
          completedSteps: [...completedSteps, 3],
          messageData: {
            customMessage: customMessage.trim(),
            previewMode,
          },
        });

        console.log('[Onboarding] Step 3: Message content saved successfully');
        return true;

      case 4: // Send & Schedule
        console.log('[Onboarding] Step 4: Validating review request send:', {
          hasRequestResult: !!requestResult,
          isSuccess: requestResult?.success,
          message: requestResult?.message || requestResult?.error,
        });

        // This step requires the request to be sent successfully before proceeding
        if (!requestResult?.success) {
          console.warn('[Onboarding] Step 4 validation failed: Request not sent successfully');
          alert('Please send the review request before continuing.');
          return false;
        }

        // Update onboarding to final step
        console.log('[Onboarding] Step 4: Saving send confirmation...');
        await updateOnboarding({
          currentStep: 5,
          completedSteps: [...completedSteps, 4],
          sendData: {
            schedulingConfig,
            requestSent: true,
            requestResult: requestResult.message,
          },
        });

        console.log('[Onboarding] Step 4: Send confirmation saved successfully');
        return true;

      case 5: // Complete
        console.log('[Onboarding] Step 5: Completing onboarding flow...');

        // Complete the onboarding flow
        const success = await completeOnboardingFlow();

        if (success) {
          console.log('[Onboarding] Onboarding completed successfully!');
          onComplete?.();
        } else {
          console.error('[Onboarding] Failed to complete onboarding flow');
        }

        return success;

      default:
        return true;
    }
  }, [
    currentStep,
    selectedBusiness,
    selectedTemplate,
    customerName,
    customerEmail,
    customerPhone,
    completedSteps,
    customMessage,
    schedulingConfig,
    requestResult,
    previewMode,
    updateOnboarding,
    completeOnboardingFlow,
    onComplete,
  ]);

  // Handle business selection
  const handleBusinessSelect = useCallback((business: BusinessData) => {
    console.log('[Onboarding] Business selected:', {
      name: business.name,
      placeId: business.placeId,
      address: business.address,
      googleMapsUrl: business.googleMapsUrl,
    });
    setSelectedBusiness(business);
  }, []);

  // Template Card Component - matching CreateReviewRequestModal exactly
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

  return (
    <OnboardingModal
      isOpen={isOpen}
      onboardingStatus={onboardingStatus}
      currentStep={currentStep}
      totalSteps={totalSteps}
      steps={steps}
      completedSteps={completedSteps}
      isLoading={isLoading}
      canGoBack={canGoBack}
      canGoNext={canGoNext}
      isFirstStep={isFirstStep}
      isLastStep={isLastStep}
      onNextStep={goToNextStep}
      onPreviousStep={goToPreviousStep}
      onCompleteOnboarding={completeOnboarding}
      stepValidation={validateCurrentStep}
    >
      {/* Step 0: Business Setup (was Step 1) */}
      {currentStep === 0 && (
        <BusinessSearchStep onBusinessSelect={handleBusinessSelect} initialSearchMethod="search" />
      )}

      {/* Step 1: Add Customer (was Step 2) */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-charcoal mb-2">
              Add your first customer to get started
            </h3>
            <p className="text-gray-600 text-sm">
              Think of a recent customer who had a great experience with your business. We'll use
              their details to send your first review request and show you exactly how the process
              works.
            </p>
          </div>

          <div className="space-y-4">
            {/* Customer Name */}
            <div>
              <label
                htmlFor="customer-name"
                className="block text-sm font-semibold text-charcoal mb-2"
              >
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="customer-name"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Enter customer's full name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                required
              />
            </div>

            {/* Customer Email */}
            <div>
              <label
                htmlFor="customer-email"
                className="block text-sm font-semibold text-charcoal mb-2"
              >
                Email Address <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="email"
                id="customer-email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
              />
            </div>

            {/* Customer Phone */}
            <div>
              <label
                htmlFor="customer-phone"
                className="block text-sm font-semibold text-charcoal mb-2"
              >
                Phone Number <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="tel"
                id="customer-phone"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="e.g., +44 7123 456789"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
              />
            </div>

            <div className="bg-forgedorange-50 border border-forgedorange-200 rounded-lg p-4">
              <p className="text-sm text-forgedorange-700">
                <strong>Why do we need this?</strong> We'll use this information to send your first
                review request and show you how the system works. Don't worry - you can add more
                customers and customize everything later.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Template Selection */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-charcoal mb-2">
              Choose Your Review Request Template
            </h3>
            <p className="text-gray-600 text-sm">
              Select a message template that matches your business style. You can customize it later
              or create your own from scratch.
            </p>
          </div>

          {/* Customer Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-900 mb-2">✅ Customer Added: {customerName}</h4>
            <p className="text-sm text-green-700">
              {customerEmail && customerPhone
                ? `${customerEmail} • ${customerPhone}`
                : customerEmail
                  ? customerEmail
                  : customerPhone
                    ? customerPhone
                    : 'Contact details added'}
            </p>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <MessageSquare className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for a template"
                value={templateFilters.search}
                onChange={e => setTemplateFilters({ ...templateFilters, search: e.target.value })}
                className="w-full h-10 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500 bg-white"
              />
            </div>

            {/* Channel Filter Pills */}
            <div className="bg-gray-100 rounded p-1 flex items-center space-x-1">
              <button
                onClick={() => setTemplateFilters({ ...templateFilters, channel: 'all' })}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  templateFilters.channel === 'all'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Channels
              </button>

              <button
                onClick={() => setTemplateFilters({ ...templateFilters, channel: 'EMAIL' })}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                  templateFilters.channel === 'EMAIL'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </button>

              <button
                onClick={() => setTemplateFilters({ ...templateFilters, channel: 'SMS' })}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                  templateFilters.channel === 'SMS'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>SMS</span>
              </button>
            </div>
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

          {selectedTemplate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">
                ✓ Selected: {selectedTemplate.name}
              </h4>
              <p className="text-sm text-blue-700">
                {selectedTemplate.description} • {selectedTemplate.channel} •{' '}
                {selectedTemplate.estimatedClickRate}% click rate
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review Message - identical to CreateReviewRequestModal compose step */}
      {currentStep === 3 && selectedTemplate && (
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
                onClick={() => goToPreviousStep()}
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
                <label className="block text-sm font-medium text-gray-700">Message Content</label>
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
                          (selectedTemplate?.channel === 'SMS' && variable.id !== 'unsubscribeUrl')
                      )
                      .map(variable => (
                        <button
                          key={variable.id}
                          type="button"
                          onClick={() => handleVariableClick(variable.name)}
                          className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-full hover:bg-blue-600 transition-colors"
                          title={variable.description}
                        >
                          {variable.name.replace(/^\\{\\{(.+)\\}\\}$/, '{$1}')}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">Message Preview</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[16rem]">
                  <div className="whitespace-pre-wrap text-gray-900">
                    {replaceVariablesWithData(
                      customMessage,
                      {
                        firstName: customerName.split(' ')[0] || customerName,
                        lastName: customerName.split(' ').slice(1).join(' ') || '',
                        email: customerEmail || 'customer@example.com',
                        phone: customerPhone || '+44 7123 456789',
                      },
                      { name: selectedBusiness?.name || 'Your Business Name' }
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Send & Schedule - identical to CreateReviewRequestModal send step */}
      {currentStep === 4 && selectedTemplate && (
        <div className="space-y-6">
          {/* Send Summary Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Ready to {schedulingConfig.type === 'immediate' ? 'Send' : 'Schedule'} Your First
              Review Request
            </h2>
            <p className="text-gray-600">
              Review your message details below and click "
              {schedulingConfig.type === 'immediate' ? 'Send Now' : 'Schedule'}" to{' '}
              {schedulingConfig.type === 'immediate'
                ? 'send your review request'
                : 'schedule your review request'}
              .
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-2">👤 Customer</h4>
              <p className="text-sm text-green-700">{customerName}</p>
              <p className="text-xs text-green-600 mt-1">
                {customerEmail && customerPhone
                  ? `${customerEmail} • ${customerPhone}`
                  : customerEmail
                    ? customerEmail
                    : customerPhone
                      ? customerPhone
                      : 'Contact details ready'}
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">📧 Template</h4>
              <p className="text-sm text-blue-700">{selectedTemplate.name}</p>
              <p className="text-xs text-blue-600 mt-1">
                {selectedTemplate.channel} • {selectedTemplate.estimatedClickRate}% click rate
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 mb-2">📝 Message</h4>
              <p className="text-sm text-purple-700">Customized message ready</p>
              <p className="text-xs text-purple-600 mt-1">{customMessage.length} characters</p>
            </div>
          </div>

          {/* Scheduling Options */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <SchedulingOptions config={schedulingConfig} onChange={setSchedulingConfig} />
          </div>

          {/* Request Results */}
          {requestResult && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Results</h3>

              {requestResult.success ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">{requestResult.message}</span>
                  </div>
                  <p className="text-sm text-green-600 mt-2">
                    Your first review request has been{' '}
                    {schedulingConfig.type === 'immediate' ? 'sent' : 'scheduled'}. You can now
                    complete the onboarding process.
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 text-red-700 mb-2">
                    <span className="font-medium">Request Failed</span>
                  </div>
                  <p className="text-sm text-red-600">{requestResult.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Send Button or Continue after Success */}
          <div className="flex justify-center">
            {!requestResult?.success ? (
              <button
                onClick={handleSendRequest}
                disabled={isCreatingRequest || !selectedTemplate || !customerName.trim()}
                className={`
                  px-8 py-3 rounded-lg font-medium flex items-center space-x-2 transition-colors
                  ${
                    !isCreatingRequest && selectedTemplate && customerName.trim()
                      ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                  }
                `}
              >
                {isCreatingRequest ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>
                      {schedulingConfig.type === 'immediate' ? 'Sending...' : 'Scheduling...'}
                    </span>
                  </>
                ) : (
                  <>
                    {schedulingConfig.type === 'immediate' ? (
                      <Send className="w-5 h-5" />
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                    <span>{schedulingConfig.type === 'immediate' ? 'Send Now' : 'Schedule'}</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Review request sent successfully! You can now complete the onboarding.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Final Confirmation */}
      {currentStep === 5 && (
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Congratulations!</h2>
            <h3 className="text-xl text-gray-700 mb-4">
              Your business is now ready to collect reviews
            </h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              You've successfully completed the onboarding process and sent your first review
              request.
              {selectedBusiness?.name} is now set up to automatically collect customer reviews and
              grow your online presence.
            </p>
          </div>

          {/* Completion Summary */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              ✅ Everything You've Accomplished
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-bold">1</span>
                  </div>
                  <h5 className="font-semibold text-gray-900">Business Connected</h5>
                </div>
                <p className="text-sm text-gray-600">{selectedBusiness?.name}</p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-bold">2</span>
                  </div>
                  <h5 className="font-semibold text-gray-900">Customer Added</h5>
                </div>
                <p className="text-sm text-gray-600">{customerName}</p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 font-bold">3</span>
                  </div>
                  <h5 className="font-semibold text-gray-900">Template Selected</h5>
                </div>
                <p className="text-sm text-gray-600">{selectedTemplate?.name}</p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <span className="text-orange-600 font-bold">4</span>
                  </div>
                  <h5 className="font-semibold text-gray-900">Message Customized</h5>
                </div>
                <p className="text-sm text-gray-600">{customMessage.length} characters</p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-bold">5</span>
                  </div>
                  <h5 className="font-semibold text-gray-900">Request Sent</h5>
                </div>
                <p className="text-sm text-gray-600">
                  {schedulingConfig.type === 'immediate'
                    ? 'Sent immediately'
                    : 'Scheduled successfully'}
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                  </div>
                  <h5 className="font-semibold text-gray-900">All Set!</h5>
                </div>
                <p className="text-sm text-gray-600">Ready to grow</p>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-blue-900 mb-4 flex items-center space-x-2">
              <span>🚀</span>
              <span>What's Next?</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-blue-600 text-sm">1</span>
                  </div>
                  <div>
                    <h5 className="font-medium text-blue-900">Add More Customers</h5>
                    <p className="text-sm text-blue-700">
                      Import your customer list or add them one by one
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-blue-600 text-sm">2</span>
                  </div>
                  <div>
                    <h5 className="font-medium text-blue-900">Create Campaigns</h5>
                    <p className="text-sm text-blue-700">
                      Set up automated review request campaigns
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-blue-600 text-sm">3</span>
                  </div>
                  <div>
                    <h5 className="font-medium text-blue-900">Track Analytics</h5>
                    <p className="text-sm text-blue-700">
                      Monitor your review rates and performance
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-blue-600 text-sm">4</span>
                  </div>
                  <div>
                    <h5 className="font-medium text-blue-900">Customize Templates</h5>
                    <p className="text-sm text-blue-700">Create your own message templates</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </OnboardingModal>
  );
}
