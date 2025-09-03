// Twilio Types
export interface TwilioSMSRequest {
  to: string;
  body: string;
  from?: string;
  statusCallback?: string;
}

export interface TwilioSMSResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  price?: string;
  priceUnit?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface TwilioWebhookPayload {
  MessageSid: string;
  MessageStatus: 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed';
  To: string;
  From: string;
  Body?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  AccountSid: string;
}

// SendGrid Types
export interface SendGridEmailRequest {
  to: {
    email: string;
    name?: string;
  };
  from: {
    email: string;
    name?: string;
  };
  subject: string;
  content: Array<{
    type: 'text/plain' | 'text/html';
    value: string;
  }>;
  trackingSettings?: {
    clickTracking?: { enable: boolean };
    openTracking?: { enable: boolean };
  };
  customArgs?: Record<string, string>;
}

export interface SendGridEmailResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export interface SendGridWebhookEvent {
  email: string;
  timestamp: number;
  'smtp-id': string;
  event:
    | 'processed'
    | 'delivered'
    | 'open'
    | 'click'
    | 'bounce'
    | 'dropped'
    | 'deferred'
    | 'unsubscribe'
    | 'group_unsubscribe'
    | 'spamreport';
  category?: string[];
  sg_event_id: string;
  sg_message_id: string;
  useragent?: string;
  ip?: string;
  url?: string;
  reason?: string;
  status?: string;
  response?: string;
  attempt?: number;
}

// Google Places Types
export interface GooglePlacesSearchRequest {
  query: string;
  location?: string;
  radius?: number;
  type?: string;
}

export interface GooglePlace {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  types: string[];
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
}

export interface GooglePlaceDetails extends GooglePlace {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string; // Google Maps URL
  reviews?: Array<{
    author_name: string;
    rating: number;
    text: string;
    time: number;
    author_url?: string;
    profile_photo_url?: string;
  }>;
}

export interface GooglePlacesSearchResponse {
  results: GooglePlace[];
  status: string;
  error_message?: string;
  next_page_token?: string;
}

export interface GooglePlaceDetailsResponse {
  result: GooglePlaceDetails;
  status: string;
  error_message?: string;
}

// BullMQ Job Types
export interface SendRequestJobData {
  requestId: string;
  retryCount?: number;
}

export interface SendFollowupJobData {
  requestId: string;
  followupType: 'first' | 'second' | 'final';
}

export interface MonitorReviewsJobData {
  businessId: string;
}

export interface ProcessWebhookJobData {
  source: 'twilio' | 'sendgrid';
  payload: TwilioWebhookPayload | SendGridWebhookEvent[];
  timestamp: string;
}

export type JobData =
  | SendRequestJobData
  | SendFollowupJobData
  | MonitorReviewsJobData
  | ProcessWebhookJobData;

// Webhook Verification Types
export interface TwilioWebhookValidation {
  signature: string;
  url: string;
  body: string;
}

export interface SendGridWebhookValidation {
  signature: string;
  timestamp: string;
  body: string;
}

// Rate Limiting Types
export interface RateLimitConfig {
  max: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

// Error Types for External Services
export interface ExternalServiceError {
  service: 'twilio' | 'sendgrid' | 'google_places';
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
}
