// Campaign settings and scheduling configuration
export interface CampaignSettings {
  // Basic campaign info
  name: string;
  description?: string;

  // Scheduling configuration
  scheduling: SchedulingConfig;

  // Follow-up configuration
  followUp: FollowUpConfig;

  // Advanced settings
  advanced: AdvancedSettings;

  // Target audience
  targets: TargetConfig;
}

export interface SchedulingConfig {
  type: 'immediate' | 'scheduled' | 'optimal';
  scheduledDateTime?: Date;
  timezone: string; // UK timezone by default
  respectBusinessHours: boolean;
  businessHours: BusinessHours;
  optimalTiming?: OptimalTimingConfig;
}

export interface BusinessHours {
  monday: TimeSlot | null;
  tuesday: TimeSlot | null;
  wednesday: TimeSlot | null;
  thursday: TimeSlot | null;
  friday: TimeSlot | null;
  saturday: TimeSlot | null;
  sunday: TimeSlot | null;
}

export interface TimeSlot {
  start: string; // HH:MM format
  end: string; // HH:MM format
  enabled: boolean;
}

export interface OptimalTimingConfig {
  businessType: BusinessType;
  customerBehaviorData?: CustomerBehaviorData;
  seasonalAdjustments: boolean;
  avoidHolidays: boolean;
}

export type BusinessType =
  | 'restaurant'
  | 'retail'
  | 'healthcare'
  | 'beauty'
  | 'automotive'
  | 'professional-services'
  | 'home-services'
  | 'fitness'
  | 'education'
  | 'other';

export interface CustomerBehaviorData {
  bestDayOfWeek: string[];
  bestTimeOfDay: string[];
  responseRateByHour: Record<string, number>;
}

export interface FollowUpConfig {
  enabled: boolean;
  maxAttempts: number;
  followUpSequence: FollowUpStep[];
  stopOnResponse: boolean;
  respectSuppressions: boolean;
}

export interface FollowUpStep {
  id: string;
  delay: FollowUpDelay;
  templateId: string;
  channel: 'SMS' | 'EMAIL' | 'AUTO'; // AUTO chooses based on original
  conditions: FollowUpCondition[];
  active: boolean;
}

export interface FollowUpDelay {
  value: number;
  unit: 'hours' | 'days' | 'weeks';
}

export interface FollowUpCondition {
  type: 'no_response' | 'no_click' | 'bounce' | 'time_elapsed';
  value?: any;
}

export interface AdvancedSettings {
  sendTimeRestrictions: SendTimeRestrictions;
  suppressionHandling: SuppressionHandling;
  deliveryOptimization: DeliveryOptimization;
  tracking: TrackingSettings;
}

export interface SendTimeRestrictions {
  enableBusinessHoursOnly: boolean;
  customTimeWindows: TimeWindow[];
  avoidWeekends: boolean;
  avoidHolidays: boolean;
  holidayList: string[]; // UK holidays
}

export interface TimeWindow {
  id: string;
  name: string;
  days: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[];
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface SuppressionHandling {
  checkSuppressionList: boolean;
  honorUnsubscribes: boolean;
  honorSmsStops: boolean;
  customSuppressionRules: SuppressionRule[];
}

export interface SuppressionRule {
  id: string;
  name: string;
  condition: string;
  action: 'skip' | 'delay' | 'switch_channel';
  enabled: boolean;
}

export interface DeliveryOptimization {
  enableSmartDelivery: boolean;
  rateLimiting: RateLimitConfig;
  retryFailedMessages: boolean;
  adaptiveScheduling: boolean;
}

export interface RateLimitConfig {
  messagesPerMinute: number;
  messagesPerHour: number;
  messagesPerDay: number;
}

export interface TrackingSettings {
  enableClickTracking: boolean;
  enableOpenTracking: boolean;
  enableDeliveryTracking: boolean;
  customTrackingParameters: Record<string, string>;
}

export interface TargetConfig {
  selectedCustomers: string[]; // Customer IDs
  totalCount: number;
  filterCriteria?: CustomerFilterCriteria;
}

export interface CustomerFilterCriteria {
  status?: string[];
  channel?: string[];
  dateAdded?: string;
  suppressed?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
}

// Campaign metrics and analytics
export interface CampaignMetrics {
  initialSend: MessageBreakdown;
  followUps: MessageBreakdown[];
  totalMessages: number;
  estimatedDeliveryRate: number;
  estimatedResponseRate: number;
}

export interface MessageBreakdown {
  stepName: string;
  smsCount: number;
  emailCount: number;
  recipientCount: number;
}

// Default configurations
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: { start: '09:00', end: '17:00', enabled: true },
  tuesday: { start: '09:00', end: '17:00', enabled: true },
  wednesday: { start: '09:00', end: '17:00', enabled: true },
  thursday: { start: '09:00', end: '17:00', enabled: true },
  friday: { start: '09:00', end: '17:00', enabled: true },
  saturday: { start: '10:00', end: '16:00', enabled: false },
  sunday: { start: '12:00', end: '16:00', enabled: false },
};

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  name: '',
  description: '',
  scheduling: {
    type: 'immediate',
    timezone: 'Europe/London',
    respectBusinessHours: true,
    businessHours: DEFAULT_BUSINESS_HOURS,
  },
  followUp: {
    enabled: false,
    maxAttempts: 2,
    followUpSequence: [],
    stopOnResponse: true,
    respectSuppressions: true,
  },
  advanced: {
    sendTimeRestrictions: {
      enableBusinessHoursOnly: true,
      customTimeWindows: [],
      avoidWeekends: false,
      avoidHolidays: true,
      holidayList: [], // Would be populated with UK holidays
    },
    suppressionHandling: {
      checkSuppressionList: true,
      honorUnsubscribes: true,
      honorSmsStops: true,
      customSuppressionRules: [],
    },
    deliveryOptimization: {
      enableSmartDelivery: false,
      rateLimiting: {
        messagesPerMinute: 10,
        messagesPerHour: 300,
        messagesPerDay: 1000,
      },
      retryFailedMessages: true,
      adaptiveScheduling: false,
    },
    tracking: {
      enableClickTracking: true,
      enableOpenTracking: true,
      enableDeliveryTracking: true,
      customTrackingParameters: {},
    },
  },
  targets: {
    selectedCustomers: [],
    totalCount: 0,
  },
};

// Predefined follow-up sequences
export const FOLLOW_UP_TEMPLATES = {
  gentle_reminder: {
    name: 'Gentle Reminder',
    steps: [
      {
        delay: { value: 3, unit: 'days' as const },
        subject: 'Quick reminder - Your feedback matters',
        message:
          'Hi {{firstName}}, just a friendly reminder about sharing your experience with {{businessName}}. Your review helps us improve! {{reviewUrl}}',
      },
    ],
  },
  professional_sequence: {
    name: 'Professional Follow-up',
    steps: [
      {
        delay: { value: 2, unit: 'days' as const },
        subject: 'How was your experience with {{businessName}}?',
        message:
          "Hi {{firstName}}, we hope you're happy with the service from {{businessName}}. If you have a moment, we'd love to hear about your experience: {{reviewUrl}}",
      },
      {
        delay: { value: 1, unit: 'weeks' as const },
        subject: 'Final reminder - Share your feedback',
        message:
          'Hi {{firstName}}, this is our final request for your valuable feedback about {{businessName}}. It only takes 30 seconds: {{reviewUrl}}',
      },
    ],
  },
  aggressive: {
    name: 'Persistent Follow-up',
    steps: [
      {
        delay: { value: 1, unit: 'days' as const },
        subject: "Don't forget to leave your review",
        message:
          'Hi {{firstName}}, did you get a chance to leave a review for {{businessName}}? {{reviewUrl}}',
      },
      {
        delay: { value: 3, unit: 'days' as const },
        subject: "We'd love your feedback",
        message:
          'Hi {{firstName}}, your opinion matters to us. Please take a moment to review your experience with {{businessName}}: {{reviewUrl}}',
      },
      {
        delay: { value: 1, unit: 'weeks' as const },
        subject: 'Last chance to share your review',
        message:
          'Hi {{firstName}}, this is your final reminder to share your experience with {{businessName}}. Thank you! {{reviewUrl}}',
      },
    ],
  },
};

// Business type optimal timing recommendations
export const OPTIMAL_TIMING_BY_BUSINESS: Record<BusinessType, OptimalTimingConfig> = {
  restaurant: {
    businessType: 'restaurant',
    seasonalAdjustments: true,
    avoidHolidays: true,
  },
  retail: {
    businessType: 'retail',
    seasonalAdjustments: true,
    avoidHolidays: true,
  },
  healthcare: {
    businessType: 'healthcare',
    seasonalAdjustments: false,
    avoidHolidays: false,
  },
  beauty: {
    businessType: 'beauty',
    seasonalAdjustments: false,
    avoidHolidays: true,
  },
  automotive: {
    businessType: 'automotive',
    seasonalAdjustments: false,
    avoidHolidays: true,
  },
  'professional-services': {
    businessType: 'professional-services',
    seasonalAdjustments: false,
    avoidHolidays: true,
  },
  'home-services': {
    businessType: 'home-services',
    seasonalAdjustments: true,
    avoidHolidays: true,
  },
  fitness: {
    businessType: 'fitness',
    seasonalAdjustments: true,
    avoidHolidays: false,
  },
  education: {
    businessType: 'education',
    seasonalAdjustments: true,
    avoidHolidays: true,
  },
  other: {
    businessType: 'other',
    seasonalAdjustments: false,
    avoidHolidays: true,
  },
};

// Helper functions
export function calculateCampaignMetrics(
  settings: CampaignSettings,
  templateChannel: 'SMS' | 'EMAIL'
): CampaignMetrics {
  const { targets, followUp } = settings;
  const recipientCount = targets.totalCount;

  // Calculate initial send metrics
  const initialSend: MessageBreakdown = {
    stepName: 'Initial Send',
    smsCount: templateChannel === 'SMS' ? recipientCount : 0,
    emailCount: templateChannel === 'EMAIL' ? recipientCount : 0,
    recipientCount,
  };

  // Calculate follow-up metrics
  const followUps: MessageBreakdown[] = [];

  if (followUp.enabled && followUp.followUpSequence.length > 0) {
    followUp.followUpSequence.forEach((step, index) => {
      // Assume 60% of recipients don't respond and get follow-up
      const followUpRecipients = Math.floor(recipientCount * 0.6 * Math.pow(0.8, index));

      const followUpBreakdown: MessageBreakdown = {
        stepName: `Follow-up ${index + 1}`,
        smsCount:
          step.channel === 'SMS' || (step.channel === 'AUTO' && templateChannel === 'SMS')
            ? followUpRecipients
            : 0,
        emailCount:
          step.channel === 'EMAIL' || (step.channel === 'AUTO' && templateChannel === 'EMAIL')
            ? followUpRecipients
            : 0,
        recipientCount: followUpRecipients,
      };

      followUps.push(followUpBreakdown);
    });
  }

  return {
    initialSend,
    followUps,
    totalMessages:
      initialSend.recipientCount + followUps.reduce((sum, f) => sum + f.recipientCount, 0),
    estimatedDeliveryRate: templateChannel === 'SMS' ? 0.98 : 0.95,
    estimatedResponseRate: followUp.enabled ? 0.15 : 0.08,
  };
}

export function getOptimalSendTime(
  businessType: BusinessType,
  timezone: string = 'Europe/London'
): Date {
  const now = new Date();
  const optimal = new Date(now);

  // Business-specific optimal timing
  switch (businessType) {
    case 'restaurant':
      // Best time: Tuesday-Thursday, 2-4 PM
      optimal.setHours(14, 0, 0, 0);
      break;
    case 'retail':
      // Best time: Weekends, 10 AM - 12 PM
      optimal.setHours(10, 0, 0, 0);
      break;
    case 'healthcare':
      // Best time: Monday-Friday, 10 AM
      optimal.setHours(10, 0, 0, 0);
      break;
    case 'beauty':
      // Best time: Tuesday-Friday, 11 AM - 1 PM
      optimal.setHours(12, 0, 0, 0);
      break;
    default:
      // General optimal time: Tuesday-Thursday, 10 AM - 2 PM
      optimal.setHours(11, 0, 0, 0);
  }

  // Ensure it's a business day if needed
  const dayOfWeek = optimal.getDay();
  if (dayOfWeek === 0) optimal.setDate(optimal.getDate() + 1); // Sunday -> Monday
  if (dayOfWeek === 6) optimal.setDate(optimal.getDate() + 2); // Saturday -> Monday

  return optimal;
}

export function validateCampaignSettings(settings: CampaignSettings): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate basic settings
  if (!settings.name.trim()) {
    errors.push('Campaign name is required');
  }

  // Validate targets
  if (settings.targets.totalCount === 0) {
    errors.push('At least one customer must be selected');
  }

  // Validate scheduling
  if (settings.scheduling.type === 'scheduled' && !settings.scheduling.scheduledDateTime) {
    errors.push('Scheduled date and time is required');
  }

  if (settings.scheduling.scheduledDateTime && settings.scheduling.scheduledDateTime < new Date()) {
    errors.push('Scheduled time cannot be in the past');
  }

  // Validate follow-ups
  if (settings.followUp.enabled) {
    if (settings.followUp.maxAttempts < 1 || settings.followUp.maxAttempts > 5) {
      errors.push('Maximum follow-up attempts must be between 1 and 5');
    }

    if (settings.followUp.followUpSequence.length === 0) {
      errors.push('At least one follow-up step is required when follow-ups are enabled');
    }

    // Check for reasonable delays
    settings.followUp.followUpSequence.forEach((step, index) => {
      if (step.delay.value <= 0) {
        errors.push(`Follow-up step ${index + 1} must have a positive delay`);
      }

      if (step.delay.value > 30 && step.delay.unit === 'days') {
        warnings.push(
          `Follow-up step ${index + 1} has a very long delay (${step.delay.value} days)`
        );
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
