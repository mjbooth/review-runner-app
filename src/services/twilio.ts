import twilio from 'twilio';
import { logger, loggers } from '../lib/logger';
import { getRequiredEnvVar } from '../lib/utils';
import type { Result } from '../types/database';
import type { TwilioSMSRequest, TwilioSMSResponse } from '../types/external';

// Twilio client instance
let twilioClient: twilio.Twilio | null = null;

/**
 * Initialize Twilio client
 */
function getTwilioClient(): twilio.Twilio {
  if (!twilioClient) {
    const accountSid = getRequiredEnvVar('TWILIO_ACCOUNT_SID');
    const authToken = getRequiredEnvVar('TWILIO_AUTH_TOKEN');

    twilioClient = twilio(accountSid, authToken);

    logger.info('Twilio client initialized', { accountSid: accountSid.slice(0, 10) + '***' });
  }

  return twilioClient;
}

/**
 * Send SMS message via Twilio
 */
export async function sendSMS(
  request: TwilioSMSRequest,
  metadata?: { requestId?: string; businessId?: string }
): Promise<Result<TwilioSMSResponse>> {
  try {
    const client = getTwilioClient();
    const fromNumber = request.from || getRequiredEnvVar('TWILIO_PHONE_NUMBER');

    loggers.external.twilioRequest({
      to: request.to.slice(0, 5) + '***',
      requestId: metadata?.requestId,
      businessId: metadata?.businessId,
    });

    // Validate phone number format
    if (!isValidPhoneNumber(request.to)) {
      return {
        success: false,
        error: 'Invalid phone number format',
      };
    }

    // Create message
    const message = await client.messages.create({
      body: request.body,
      from: fromNumber,
      to: request.to,
      statusCallback: request.statusCallback,
    });

    const response: TwilioSMSResponse = {
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
      price: message.price,
      priceUnit: message.priceUnit,
      errorCode: message.errorCode?.toString(),
      errorMessage: message.errorMessage,
    };

    loggers.external.twilioResponse({
      messageId: message.sid,
      status: message.status,
      requestId: metadata?.requestId,
      businessId: metadata?.businessId,
    });

    logger.info('SMS sent successfully', {
      messageId: message.sid,
      to: request.to.slice(0, 5) + '***',
      status: message.status,
      requestId: metadata?.requestId,
    });

    return { success: true, data: response };
  } catch (error) {
    const twilioError = error as any;
    const errorMessage = twilioError.message || 'Unknown Twilio error';
    const errorCode = twilioError.code?.toString();

    loggers.external.twilioResponse({
      messageId: '',
      status: 'failed',
      requestId: metadata?.requestId,
      businessId: metadata?.businessId,
      error: errorMessage,
    });

    logger.error('Failed to send SMS', {
      to: request.to.slice(0, 5) + '***',
      error: errorMessage,
      code: errorCode,
      requestId: metadata?.requestId,
    });

    // Handle specific Twilio error codes
    if (errorCode) {
      const friendlyError = getTwilioErrorMessage(errorCode);
      return { success: false, error: friendlyError };
    }

    return {
      success: false,
      error: `SMS sending failed: ${errorMessage}`,
    };
  }
}

/**
 * Validate phone number format for SMS
 */
function isValidPhoneNumber(phoneNumber: string): boolean {
  // Basic E.164 format validation
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Get user-friendly error messages for common Twilio error codes
 */
function getTwilioErrorMessage(errorCode: string): string {
  const errorMap: Record<string, string> = {
    '21211': 'Invalid phone number format',
    '21408': 'Permission to send SMS has not been enabled for the region',
    '21610': 'Message rejected - unsubscribed recipient',
    '30001': 'Queue overflow - too many messages queued',
    '30002': 'Account suspended',
    '30003': 'Unreachable destination handset',
    '30004': 'Message blocked by carrier',
    '30005': 'Unknown destination handset',
    '30006': 'Landline or unreachable carrier',
    '30007': 'Carrier violation',
    '30008': 'Unknown error',
    '63016': 'The destination phone number is not valid',
    '63017': 'The source phone number is not valid for this region',
  };

  return errorMap[errorCode] || `SMS delivery failed (Error ${errorCode})`;
}

/**
 * Handle Twilio webhook payload
 */
export async function handleTwilioWebhook(
  payload: any
): Promise<Result<{ messageId: string; status: string }>> {
  try {
    const {
      MessageSid: messageId,
      MessageStatus: status,
      To: to,
      From: from,
      ErrorCode: errorCode,
      ErrorMessage: errorMessage,
    } = payload;

    if (!messageId) {
      return { success: false, error: 'MessageSid is required' };
    }

    logger.info('Twilio webhook received', {
      messageId,
      status,
      to: to?.slice(0, 5) + '***',
      from: from?.slice(0, 5) + '***',
      errorCode,
      errorMessage,
    });

    // Validate webhook authenticity (optional - implement if needed)
    // const isValid = validateTwilioSignature(payload, signature, url);
    // if (!isValid) {
    //   return { success: false, error: 'Invalid webhook signature' };
    // }

    return {
      success: true,
      data: { messageId, status },
    };
  } catch (error) {
    logger.error('Failed to handle Twilio webhook', { payload, error });
    return { success: false, error: 'Failed to process webhook' };
  }
}

/**
 * Get SMS delivery status from Twilio
 */
export async function getSMSStatus(
  messageSid: string
): Promise<Result<{ status: string; errorCode?: string; errorMessage?: string }>> {
  try {
    const client = getTwilioClient();
    const message = await client.messages(messageSid).fetch();

    return {
      success: true,
      data: {
        status: message.status,
        errorCode: message.errorCode?.toString(),
        errorMessage: message.errorMessage,
      },
    };
  } catch (error) {
    logger.error('Failed to get SMS status', { messageSid, error });
    return { success: false, error: 'Failed to fetch SMS status' };
  }
}

/**
 * Validate Twilio webhook signature (for security)
 */
export function validateTwilioSignature(payload: string, signature: string, url: string): boolean {
  try {
    const authToken = getRequiredEnvVar('TWILIO_AUTH_TOKEN');
    return twilio.validateRequest(authToken, payload, url, signature);
  } catch (error) {
    logger.error('Failed to validate Twilio signature', { error });
    return false;
  }
}

/**
 * Check Twilio account balance and limits
 */
export async function getTwilioAccountInfo(): Promise<
  Result<{
    balance: string;
    currency: string;
    status: string;
  }>
> {
  try {
    const client = getTwilioClient();
    const account = await client.api.v2010.accounts(client.accountSid).fetch();

    return {
      success: true,
      data: {
        balance: account.balance,
        currency: account.currency,
        status: account.status,
      },
    };
  } catch (error) {
    logger.error('Failed to get Twilio account info', { error });
    return { success: false, error: 'Failed to fetch account information' };
  }
}

/**
 * List recent SMS messages for debugging
 */
export async function getRecentSMSMessages(limit: number = 20): Promise<
  Result<
    Array<{
      sid: string;
      to: string;
      from: string;
      body: string;
      status: string;
      direction: string;
      dateCreated: Date;
      errorCode?: string;
      errorMessage?: string;
    }>
  >
> {
  try {
    const client = getTwilioClient();
    const messages = await client.messages.list({ limit });

    const formattedMessages = messages.map(message => ({
      sid: message.sid,
      to: message.to,
      from: message.from,
      body: message.body,
      status: message.status,
      direction: message.direction,
      dateCreated: message.dateCreated,
      errorCode: message.errorCode?.toString(),
      errorMessage: message.errorMessage,
    }));

    return { success: true, data: formattedMessages };
  } catch (error) {
    logger.error('Failed to get recent SMS messages', { error });
    return { success: false, error: 'Failed to fetch recent messages' };
  }
}

/**
 * Send test SMS message for validation
 */
export async function sendTestSMS(
  toNumber: string,
  customMessage?: string
): Promise<Result<{ messageId: string; status: string }>> {
  const testMessage =
    customMessage || 'This is a test message from Review Runner. Reply STOP to opt out.';

  const result = await sendSMS({
    to: toNumber,
    body: testMessage,
  });

  if (result.success) {
    return {
      success: true,
      data: {
        messageId: result.data.sid,
        status: result.data.status,
      },
    };
  }

  return result;
}

/**
 * Format UK phone number for Twilio
 */
export function formatPhoneNumberForTwilio(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // Convert UK numbers to international format
  if (digits.length === 10 && digits.startsWith('0')) {
    return '+44' + digits.substring(1);
  }

  if (digits.length === 11 && digits.startsWith('44')) {
    return '+' + digits;
  }

  // Already in international format
  if (digits.startsWith('44') && digits.length === 12) {
    return '+' + digits;
  }

  // Return as-is if can't format
  return phoneNumber;
}

/**
 * Check if a phone number can receive SMS
 */
export async function checkPhoneNumberCapabilities(
  phoneNumber: string
): Promise<Result<{ canReceiveSMS: boolean; carrier?: string; country?: string }>> {
  try {
    const client = getTwilioClient();
    const lookup = await client.lookups.v1.phoneNumbers(phoneNumber).fetch({
      type: ['carrier'],
    });

    const canReceiveSMS = lookup.carrier?.type !== 'landline';

    return {
      success: true,
      data: {
        canReceiveSMS,
        carrier: lookup.carrier?.name,
        country: lookup.countryCode,
      },
    };
  } catch (error) {
    logger.error('Failed to check phone number capabilities', {
      phoneNumber: phoneNumber.slice(0, 5) + '***',
      error,
    });
    return { success: false, error: 'Failed to verify phone number' };
  }
}
