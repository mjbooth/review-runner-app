'use client';

import React, { useState } from 'react';

interface ReviewRequestSettingsSectionProps {
  settings?: {
    businessHours?: Record<string, { open: string; close: string; enabled: boolean }>;
    defaultChannel?: 'EMAIL' | 'SMS';
    followUpSettings?: {
      enabled: boolean;
      delayDays: number[];
      maxAttempts: number;
    };
  };
  onUpdate: (settings: any) => Promise<void>;
}

export function ReviewRequestSettingsSection({
  settings,
  onUpdate,
}: ReviewRequestSettingsSectionProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'timing' | 'preferences'>('templates');
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showSMSPreview, setShowSMSPreview] = useState(false);

  // Default templates for preview - all hardcoded values
  const previewEmailSubject = 'Share your experience with Your Business';
  const previewEmailContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Share Your Experience</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #f9f9f9; border-radius: 10px; padding: 30px; text-align: center;">
        <h2 style="color: #2563eb; margin-bottom: 20px;">Hi John Smith,</h2>
        <p style="font-size: 16px; margin-bottom: 20px;">Thank you for choosing Your Business!</p>
        <p style="font-size: 16px; margin-bottom: 30px;">We hope you had a great experience with us. Would you mind taking a moment to share your feedback?</p>
        <a href="#" style="display: inline-block; background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Leave a Review</a>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Don't want to receive these emails? <a href="#" style="color: #666;">Unsubscribe here</a>
        </p>
    </div>
</body>
</html>`;

  const previewSMSContent =
    "Hi John Smith, thank you for choosing Your Business! We'd love your feedback: https://g.page/r/... Reply STOP to opt out.";

  const businessHours = settings?.businessHours || {
    Monday: { open: '09:00', close: '17:00', enabled: true },
    Tuesday: { open: '09:00', close: '17:00', enabled: true },
    Wednesday: { open: '09:00', close: '17:00', enabled: true },
    Thursday: { open: '09:00', close: '17:00', enabled: true },
    Friday: { open: '09:00', close: '17:00', enabled: true },
    Saturday: { open: '10:00', close: '16:00', enabled: false },
    Sunday: { open: '10:00', close: '16:00', enabled: false },
  };

  const followUpSettings = settings?.followUpSettings || {
    enabled: false,
    delayDays: [3, 7],
    maxAttempts: 2,
  };

  const TabButton = ({
    id,
    label,
    isActive,
    onClick,
  }: {
    id: string;
    label: string;
    isActive: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        isActive
          ? 'bg-forgedorange-100 text-forgedorange-700'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  const ComingSoonBadge = () => (
    <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
      Coming Soon
    </span>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Section Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-charcoal">Review Request Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure how and when review requests are sent to your customers
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex space-x-2">
          <TabButton
            id="templates"
            label="Message Templates"
            isActive={activeTab === 'templates'}
            onClick={() => setActiveTab('templates')}
          />
          <TabButton
            id="timing"
            label="Timing & Follow-ups"
            isActive={activeTab === 'timing'}
            onClick={() => setActiveTab('timing')}
          />
          <TabButton
            id="preferences"
            label="Preferences"
            isActive={activeTab === 'preferences'}
            onClick={() => setActiveTab('preferences')}
          />
        </div>
      </div>

      <div className="p-6">
        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            {/* Email Template */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-charcoal">Email Template</h3>
                  <p className="text-sm text-gray-600">
                    Default template for email review requests
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <ComingSoonBadge />
                  <button
                    onClick={() => setShowEmailPreview(!showEmailPreview)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    {showEmailPreview ? 'Hide Preview' : 'Preview'}
                  </button>
                </div>
              </div>

              {showEmailPreview && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Email Preview</h4>
                  <div className="bg-white border rounded p-4 max-h-60 overflow-y-auto">
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Subject:</strong> {previewEmailSubject}
                    </div>
                    <div className="text-sm">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: previewEmailContent,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                <strong>Available variables:</strong> customerName, businessName, trackingUrl,
                reviewUrl, unsubscribeUrl
              </div>
            </div>

            {/* SMS Template */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-charcoal">SMS Template</h3>
                  <p className="text-sm text-gray-600">Default template for SMS review requests</p>
                </div>
                <div className="flex items-center space-x-3">
                  <ComingSoonBadge />
                  <button
                    onClick={() => setShowSMSPreview(!showSMSPreview)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    {showSMSPreview ? 'Hide Preview' : 'Preview'}
                  </button>
                </div>
              </div>

              {showSMSPreview && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">SMS Preview</h4>
                  <div className="bg-white border rounded p-3 max-w-xs mx-auto">
                    <div className="text-sm">{previewSMSContent}</div>
                  </div>
                  <div className="text-xs text-gray-500 text-center mt-2">
                    Character count: ~{previewSMSContent.length} (max 160)
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                <strong>Available variables:</strong> customerName, businessName, reviewUrl
                <br />
                <strong>Note:</strong> SMS messages are limited to 160 characters for optimal
                delivery.
              </div>
            </div>
          </div>
        )}

        {/* Timing Tab */}
        {activeTab === 'timing' && (
          <div className="space-y-6">
            {/* Business Hours Enforcement */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-charcoal">
                    Business Hours Enforcement
                  </h3>
                  <p className="text-sm text-gray-600">
                    Only send review requests during business hours
                  </p>
                </div>
                <ComingSoonBadge />
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="space-y-3">
                  {Object.entries(businessHours).map(([day, hours]) => (
                    <div key={day} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={hours.enabled}
                          disabled
                          className="w-4 h-4 text-forgedorange-600 bg-gray-100 border-gray-300 rounded focus:ring-forgedorange-500 disabled:opacity-50"
                        />
                        <label className="ml-3 text-sm font-medium text-gray-700">{day}</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={hours.open}
                          disabled
                          className="px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50"
                        />
                        <span className="text-sm text-gray-500">to</span>
                        <input
                          type="time"
                          value={hours.close}
                          disabled
                          className="px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Review requests sent outside business hours will be queued for the next business
                    day.
                  </p>
                </div>
              </div>
            </div>

            {/* Follow-up Settings */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-charcoal">Follow-up Campaigns</h3>
                  <p className="text-sm text-gray-600">
                    Automatic follow-up messages for non-responders
                  </p>
                </div>
                <ComingSoonBadge />
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-medium text-gray-700">
                    Enable automatic follow-ups
                  </label>
                  <input
                    type="checkbox"
                    checked={followUpSettings.enabled}
                    disabled
                    className="w-4 h-4 text-forgedorange-600 bg-gray-100 border-gray-300 rounded focus:ring-forgedorange-500 disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Follow-up Days
                    </label>
                    <input
                      type="text"
                      value={followUpSettings.delayDays.join(', ')}
                      placeholder="3, 7, 14"
                      disabled
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Days after initial request</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Attempts
                    </label>
                    <input
                      type="number"
                      value={followUpSettings.maxAttempts}
                      min="1"
                      max="5"
                      disabled
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Including initial request</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <div className="space-y-6">
            {/* Default Channel */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-charcoal">
                    Default Communication Channel
                  </h3>
                  <p className="text-sm text-gray-600">
                    Preferred method for sending review requests
                  </p>
                </div>
                <ComingSoonBadge />
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="relative">
                    <input
                      type="radio"
                      name="defaultChannel"
                      value="EMAIL"
                      checked={settings?.defaultChannel === 'EMAIL'}
                      disabled
                      className="sr-only"
                    />
                    <div className="p-4 border-2 border-gray-200 rounded-lg cursor-pointer bg-gray-50">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                          <svg
                            className="w-4 h-4 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Email</div>
                          <div className="text-sm text-gray-600">Rich formatting, tracking</div>
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="relative">
                    <input
                      type="radio"
                      name="defaultChannel"
                      value="SMS"
                      checked={settings?.defaultChannel === 'SMS'}
                      disabled
                      className="sr-only"
                    />
                    <div className="p-4 border-2 border-gray-200 rounded-lg cursor-pointer bg-gray-50">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                          <svg
                            className="w-4 h-4 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">SMS</div>
                          <div className="text-sm text-gray-600">
                            Instant delivery, higher open rates
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Suppression Management */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-charcoal">
                    Suppression List Management
                  </h3>
                  <p className="text-sm text-gray-600">Manage opt-outs and blocked contacts</p>
                </div>
                <ComingSoonBadge />
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">0</div>
                    <div className="text-sm text-gray-600">Email Suppressions</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">0</div>
                    <div className="text-sm text-gray-600">SMS Suppressions</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">0</div>
                    <div className="text-sm text-gray-600">Manual Blocks</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-center">
                  <button
                    disabled
                    className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed"
                  >
                    Manage Suppressions
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
