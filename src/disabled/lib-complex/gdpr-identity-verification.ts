/**
 * GDPR Identity Verification System
 *
 * Comprehensive identity verification for GDPR data subject requests
 * with multi-factor authentication, risk assessment, and encrypted data handling.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import { getEncryptedCustomerService } from '../services/customers-encrypted';
import { getSearchableEncryptionService } from './searchable-encryption';
import crypto from 'crypto';
import speakeasy from 'speakeasy';

// ==========================================
// IDENTITY VERIFICATION TYPES
// ==========================================

export type VerificationMethod =
  | 'EMAIL_TOKEN' // Email verification token
  | 'SMS_CODE' // SMS verification code
  | 'KNOWLEDGE_QUESTIONS' // Security questions based on data
  | 'DOCUMENT_UPLOAD' // ID document verification
  | 'BIOMETRIC_CHECK' // Voice/photo verification
  | 'PHONE_CALL' // Manual phone verification
  | 'EXISTING_ACCOUNT' // Account-based verification
  | 'MULTI_FACTOR'; // Combined methods

export type VerificationStatus =
  | 'PENDING' // Verification initiated
  | 'IN_PROGRESS' // Actively verifying
  | 'VERIFIED' // Successfully verified
  | 'FAILED' // Verification failed
  | 'EXPIRED' // Verification expired
  | 'CANCELLED' // User cancelled
  | 'BLOCKED'; // Too many failed attempts

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface VerificationRequest {
  id: string;
  requestId: string; // GDPR request ID
  businessId: string;
  customerId?: string; // Set when identity is verified

  // Verification details
  method: VerificationMethod;
  status: VerificationStatus;
  riskLevel: RiskLevel;
  confidence: number; // 0-100 confidence score

  // Identity data provided
  providedEmail: string;
  providedPhone?: string;
  providedName?: string;
  providedData: Record<string, any>;

  // Verification challenges
  challenges: VerificationChallenge[];
  completedChallenges: string[];
  failedAttempts: number;
  maxAttempts: number;

  // Timeline
  initiatedAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  lastAttemptAt?: Date;

  // Metadata
  ipAddress?: string;
  userAgent?: string;
  browserFingerprint?: string;

  // Audit
  verificationSteps: VerificationStep[];

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationChallenge {
  id: string;
  type: 'TOKEN' | 'CODE' | 'QUESTION' | 'DOCUMENT' | 'BIOMETRIC' | 'PHONE_CALL';
  description: string;
  data: Record<string, any>; // Challenge-specific data
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  completedAt?: Date;
}

export interface VerificationStep {
  id: string;
  timestamp: Date;
  method: VerificationMethod;
  action: string;
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  confidence: number;
  metadata: Record<string, any>;
  error?: string;
}

export interface IdentityMatch {
  customerId: string;
  confidence: number;
  matchingFields: string[];
  discrepancies: string[];
  riskFactors: string[];
  businessId: string;
}

export interface VerificationResult {
  success: boolean;
  verificationId: string;
  customerId?: string;
  confidence: number;
  method: VerificationMethod;
  riskLevel: RiskLevel;
  message: string;
  nextSteps?: string[];
  errors?: string[];
  requiredChallenges?: VerificationChallenge[];
}

// ==========================================
// IDENTITY VERIFICATION SERVICE
// ==========================================

export class GDPRIdentityVerificationService {
  private customerService = getEncryptedCustomerService();
  private searchableEncryption = getSearchableEncryptionService();

  // Configuration
  private readonly config = {
    tokenExpiryMinutes: parseInt(process.env.GDPR_TOKEN_EXPIRY || '60'),
    smsCodeExpiryMinutes: parseInt(process.env.GDPR_SMS_EXPIRY || '10'),
    maxVerificationAttempts: parseInt(process.env.GDPR_MAX_ATTEMPTS || '5'),
    highRiskThreshold: parseInt(process.env.GDPR_HIGH_RISK_THRESHOLD || '70'),
    mediumRiskThreshold: parseInt(process.env.GDPR_MEDIUM_RISK_THRESHOLD || '40'),
    requiredConfidenceLevel: parseInt(process.env.GDPR_MIN_CONFIDENCE || '75'),
  };

  /**
   * Initiate identity verification for GDPR request
   */
  async initiateVerification(
    requestId: string,
    businessId: string,
    identityData: {
      email: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      additionalData?: Record<string, any>;
    },
    context?: {
      ipAddress?: string;
      userAgent?: string;
      browserFingerprint?: string;
      preferredMethod?: VerificationMethod;
    }
  ): Promise<VerificationResult> {
    const verificationId = crypto.randomUUID();

    try {
      // Initial risk assessment
      const riskAssessment = await this.assessVerificationRisk(businessId, identityData, context);

      // Find potential customer matches
      const identityMatches = await this.findIdentityMatches(businessId, identityData);

      // Determine verification method based on risk and matches
      const verificationMethod = await this.determineVerificationMethod(
        riskAssessment.riskLevel,
        identityMatches,
        context?.preferredMethod
      );

      // Generate verification challenges
      const challenges = await this.generateVerificationChallenges(
        verificationMethod,
        identityMatches,
        riskAssessment
      );

      // Create verification request
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.config.tokenExpiryMinutes);

      const verificationRequest: Omit<VerificationRequest, 'createdAt' | 'updatedAt'> = {
        id: verificationId,
        requestId,
        businessId,
        method: verificationMethod,
        status: 'PENDING',
        riskLevel: riskAssessment.riskLevel,
        confidence: riskAssessment.confidence,
        providedEmail: identityData.email.toLowerCase().trim(),
        providedPhone: identityData.phone,
        providedName: [identityData.firstName, identityData.lastName].filter(Boolean).join(' '),
        providedData: identityData.additionalData || {},
        challenges,
        completedChallenges: [],
        failedAttempts: 0,
        maxAttempts: this.config.maxVerificationAttempts,
        initiatedAt: new Date(),
        expiresAt,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        browserFingerprint: context?.browserFingerprint,
        verificationSteps: [],
        isActive: true,
      };

      // Store verification request
      await prisma.verificationRequest.create({
        data: verificationRequest as any,
      });

      // Send initial verification challenges
      const challengeResult = await this.sendVerificationChallenges(
        verificationId,
        challenges.filter(c => c.type === 'TOKEN' || c.type === 'CODE')
      );

      // Audit verification initiation
      await auditLog({
        category: 'compliance',
        type: 'GDPR_VERIFICATION_INITIATED',
        severity: 'medium',
        description: 'GDPR identity verification initiated',
        businessId,
        metadata: {
          verificationId,
          requestId,
          method: verificationMethod,
          riskLevel: riskAssessment.riskLevel,
          confidence: riskAssessment.confidence,
          challengeCount: challenges.length,
          potentialMatches: identityMatches.length,
        },
        flags: {
          complianceRelevant: true,
          personalData: true,
        },
      });

      logger.info('GDPR identity verification initiated', {
        verificationId,
        requestId,
        businessId,
        method: verificationMethod,
        riskLevel: riskAssessment.riskLevel,
        challengeCount: challenges.length,
      });

      return {
        success: true,
        verificationId,
        confidence: riskAssessment.confidence,
        method: verificationMethod,
        riskLevel: riskAssessment.riskLevel,
        message: 'Identity verification initiated',
        nextSteps: this.generateNextSteps(challenges),
        requiredChallenges: challenges,
      };
    } catch (error) {
      logger.error('GDPR verification initiation failed', {
        requestId,
        businessId,
        identityData: { email: identityData.email },
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        verificationId,
        confidence: 0,
        method: 'EMAIL_TOKEN',
        riskLevel: 'HIGH',
        message: 'Failed to initiate verification',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Submit verification challenge response
   */
  async submitChallengeResponse(
    verificationId: string,
    challengeId: string,
    response: any,
    context?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<VerificationResult> {
    try {
      // Get verification request
      const verification = await prisma.verificationRequest.findUnique({
        where: { id: verificationId },
      });

      if (!verification || !verification.isActive) {
        return this.createFailureResult(verificationId, 'Verification request not found');
      }

      if (verification.status === 'VERIFIED') {
        return this.createSuccessResult(verification as VerificationRequest);
      }

      if (verification.status === 'BLOCKED' || verification.status === 'EXPIRED') {
        return this.createFailureResult(
          verificationId,
          `Verification ${verification.status.toLowerCase()}`
        );
      }

      // Check expiration
      if (new Date() > verification.expiresAt) {
        await this.expireVerification(verificationId);
        return this.createFailureResult(verificationId, 'Verification expired');
      }

      // Find the challenge
      const challenge = verification.challenges.find(c => c.id === challengeId);
      if (!challenge) {
        return this.createFailureResult(verificationId, 'Challenge not found');
      }

      if (challenge.status === 'COMPLETED') {
        return this.createFailureResult(verificationId, 'Challenge already completed');
      }

      // Verify the challenge response
      const challengeResult = await this.verifyChallengeResponse(
        verification as VerificationRequest,
        challenge,
        response,
        context
      );

      // Record verification step
      const verificationStep: VerificationStep = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        method: verification.method as VerificationMethod,
        action: `verify_${challenge.type.toLowerCase()}`,
        result: challengeResult.success ? 'SUCCESS' : 'FAILURE',
        confidence: challengeResult.confidence,
        metadata: {
          challengeId,
          challengeType: challenge.type,
          ...challengeResult.metadata,
        },
        error: challengeResult.error,
      };

      // Update verification request
      const updates: any = {
        lastAttemptAt: new Date(),
        verificationSteps: [...verification.verificationSteps, verificationStep],
        updatedAt: new Date(),
      };

      if (challengeResult.success) {
        // Mark challenge as completed
        const updatedChallenges = verification.challenges.map(c =>
          c.id === challengeId ? { ...c, status: 'COMPLETED', completedAt: new Date() } : c
        );
        updates.challenges = updatedChallenges;
        updates.completedChallenges = [...verification.completedChallenges, challengeId];

        // Check if all required challenges are completed
        const requiredChallenges = updatedChallenges.filter(c => c.type !== 'BIOMETRIC');
        const completedRequired = requiredChallenges.filter(c => c.status === 'COMPLETED');

        if (completedRequired.length === requiredChallenges.length) {
          // Verification complete
          updates.status = 'VERIFIED';
          updates.completedAt = new Date();
          updates.confidence = Math.max(verification.confidence, challengeResult.confidence);
          updates.customerId = challengeResult.customerId;
        }
      } else {
        // Handle failed challenge
        updates.failedAttempts = verification.failedAttempts + 1;

        // Update challenge attempt count
        const updatedChallenges = verification.challenges.map(c =>
          c.id === challengeId ? { ...c, attempts: c.attempts + 1 } : c
        );
        updates.challenges = updatedChallenges;

        // Check if verification should be blocked
        if (updates.failedAttempts >= verification.maxAttempts) {
          updates.status = 'BLOCKED';
          updates.isActive = false;
        }
      }

      // Update database
      await prisma.verificationRequest.update({
        where: { id: verificationId },
        data: updates,
      });

      // Audit the challenge response
      await auditLog({
        category: 'compliance',
        type: challengeResult.success ? 'GDPR_CHALLENGE_SUCCESS' : 'GDPR_CHALLENGE_FAILED',
        severity: challengeResult.success ? 'low' : 'medium',
        description: `GDPR verification challenge ${challengeResult.success ? 'succeeded' : 'failed'}`,
        businessId: verification.businessId,
        metadata: {
          verificationId,
          challengeId,
          challengeType: challenge.type,
          confidence: challengeResult.confidence,
          failedAttempts: updates.failedAttempts,
          customerId: challengeResult.customerId,
        },
        flags: {
          complianceRelevant: true,
          suspicious: !challengeResult.success && updates.failedAttempts > 2,
        },
      });

      if (updates.status === 'VERIFIED') {
        logger.info('GDPR identity verification completed successfully', {
          verificationId,
          customerId: challengeResult.customerId,
          finalConfidence: updates.confidence,
          completedChallenges: updates.completedChallenges.length,
        });

        return this.createSuccessResult({
          ...verification,
          ...updates,
          customerId: challengeResult.customerId,
        } as VerificationRequest);
      }

      if (updates.status === 'BLOCKED') {
        logger.warn('GDPR identity verification blocked due to failed attempts', {
          verificationId,
          failedAttempts: updates.failedAttempts,
        });

        return this.createFailureResult(verificationId, 'Too many failed attempts');
      }

      return {
        success: true,
        verificationId,
        confidence: verification.confidence,
        method: verification.method as VerificationMethod,
        riskLevel: verification.riskLevel as RiskLevel,
        message: 'Challenge completed successfully',
        nextSteps: this.generateNextSteps(
          updates.challenges.filter((c: any) => c.status === 'PENDING')
        ),
      };
    } catch (error) {
      logger.error('Challenge response verification failed', {
        verificationId,
        challengeId,
        error: error instanceof Error ? error.message : String(error),
      });

      return this.createFailureResult(verificationId, 'Failed to process challenge response', [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  // ==========================================
  // PRIVATE VERIFICATION METHODS
  // ==========================================

  /**
   * Assess verification risk based on provided data
   */
  private async assessVerificationRisk(
    businessId: string,
    identityData: any,
    context?: any
  ): Promise<{ riskLevel: RiskLevel; confidence: number; factors: string[] }> {
    let riskScore = 0;
    let confidence = 50;
    const factors: string[] = [];

    // Check provided data completeness
    const dataFields = Object.keys(identityData).filter(k => identityData[k]).length;
    if (dataFields >= 4) {
      confidence += 20;
      factors.push('Complete identity data provided');
    } else if (dataFields >= 2) {
      confidence += 10;
      factors.push('Partial identity data provided');
    } else {
      riskScore += 30;
      factors.push('Incomplete identity data');
    }

    // Check for suspicious patterns
    if (context?.ipAddress) {
      // Check IP reputation (would integrate with threat intelligence)
      const ipCheck = await this.checkIPReputation(context.ipAddress);
      if (ipCheck.suspicious) {
        riskScore += ipCheck.riskScore;
        factors.push(`Suspicious IP: ${ipCheck.reason}`);
      }
    }

    // Check recent verification attempts
    const recentAttempts = await prisma.verificationRequest.count({
      where: {
        businessId,
        providedEmail: identityData.email,
        createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (recentAttempts > 3) {
      riskScore += 40;
      factors.push('Multiple recent verification attempts');
    }

    // Determine risk level
    let riskLevel: RiskLevel;
    if (riskScore >= this.config.highRiskThreshold) {
      riskLevel = 'HIGH';
    } else if (riskScore >= this.config.mediumRiskThreshold) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    return { riskLevel, confidence: Math.max(0, confidence - riskScore), factors };
  }

  /**
   * Find potential customer identity matches
   */
  private async findIdentityMatches(
    businessId: string,
    identityData: any
  ): Promise<IdentityMatch[]> {
    const matches: IdentityMatch[] = [];

    try {
      // Search by email (primary matching)
      if (identityData.email) {
        const emailMatches = await this.customerService.searchCustomers(
          businessId,
          { email: identityData.email, status: 'active' },
          { userId: 'gdpr-verification-system' }
        );

        for (const customer of emailMatches.customers) {
          const match = await this.calculateIdentityMatch(customer, identityData);
          if (match.confidence > 50) {
            matches.push(match);
          }
        }
      }

      // Search by phone (secondary matching)
      if (identityData.phone && matches.length === 0) {
        const phoneMatches = await this.customerService.searchCustomers(
          businessId,
          { phone: identityData.phone, status: 'active' },
          { userId: 'gdpr-verification-system' }
        );

        for (const customer of phoneMatches.customers) {
          const match = await this.calculateIdentityMatch(customer, identityData);
          if (match.confidence > 30) {
            matches.push(match);
          }
        }
      }

      // Search by name (tertiary matching)
      if (identityData.firstName && matches.length === 0) {
        const nameMatches = await this.customerService.searchCustomers(
          businessId,
          {
            firstName: identityData.firstName,
            lastName: identityData.lastName,
            status: 'active',
          },
          { userId: 'gdpr-verification-system' }
        );

        for (const customer of nameMatches.customers) {
          const match = await this.calculateIdentityMatch(customer, identityData);
          if (match.confidence > 20) {
            matches.push(match);
          }
        }
      }

      return matches.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      logger.error('Identity matching failed', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Calculate identity match confidence
   */
  private async calculateIdentityMatch(customer: any, identityData: any): Promise<IdentityMatch> {
    let confidence = 0;
    const matchingFields: string[] = [];
    const discrepancies: string[] = [];
    const riskFactors: string[] = [];

    // Email match (highest confidence)
    if (identityData.email && customer.email) {
      if (identityData.email.toLowerCase() === customer.email.toLowerCase()) {
        confidence += 40;
        matchingFields.push('email');
      } else {
        discrepancies.push('email');
        riskFactors.push('Email mismatch');
      }
    }

    // Phone match
    if (identityData.phone && customer.phone) {
      const normalizedProvided = this.normalizePhone(identityData.phone);
      const normalizedCustomer = this.normalizePhone(customer.phone);

      if (normalizedProvided === normalizedCustomer) {
        confidence += 30;
        matchingFields.push('phone');
      } else {
        discrepancies.push('phone');
        riskFactors.push('Phone number mismatch');
      }
    }

    // Name match
    if (identityData.firstName && customer.firstName) {
      const similarity = this.calculateStringSimilarity(
        identityData.firstName.toLowerCase(),
        customer.firstName.toLowerCase()
      );

      if (similarity > 0.8) {
        confidence += 15;
        matchingFields.push('firstName');
      } else if (similarity > 0.6) {
        confidence += 5;
        riskFactors.push('First name partial match');
      } else {
        discrepancies.push('firstName');
        riskFactors.push('First name mismatch');
      }
    }

    if (identityData.lastName && customer.lastName) {
      const similarity = this.calculateStringSimilarity(
        identityData.lastName.toLowerCase(),
        customer.lastName.toLowerCase()
      );

      if (similarity > 0.8) {
        confidence += 15;
        matchingFields.push('lastName');
      } else if (similarity > 0.6) {
        confidence += 5;
        riskFactors.push('Last name partial match');
      } else {
        discrepancies.push('lastName');
        riskFactors.push('Last name mismatch');
      }
    }

    return {
      customerId: customer.id,
      confidence: Math.min(100, confidence),
      matchingFields,
      discrepancies,
      riskFactors,
      businessId: customer.businessId,
    };
  }

  /**
   * Determine appropriate verification method
   */
  private async determineVerificationMethod(
    riskLevel: RiskLevel,
    matches: IdentityMatch[],
    preferredMethod?: VerificationMethod
  ): Promise<VerificationMethod> {
    // High-risk requests require multi-factor verification
    if (riskLevel === 'HIGH') {
      return 'MULTI_FACTOR';
    }

    // No matches found - require document verification
    if (matches.length === 0) {
      return 'DOCUMENT_UPLOAD';
    }

    // High confidence match - allow email verification
    if (matches[0].confidence > 80) {
      return preferredMethod || 'EMAIL_TOKEN';
    }

    // Medium confidence - require additional verification
    if (matches[0].confidence > 60) {
      return preferredMethod === 'EMAIL_TOKEN' ? 'SMS_CODE' : 'KNOWLEDGE_QUESTIONS';
    }

    // Low confidence - require multi-factor
    return 'MULTI_FACTOR';
  }

  /**
   * Generate verification challenges
   */
  private async generateVerificationChallenges(
    method: VerificationMethod,
    matches: IdentityMatch[],
    riskAssessment: any
  ): Promise<VerificationChallenge[]> {
    const challenges: VerificationChallenge[] = [];

    switch (method) {
      case 'EMAIL_TOKEN':
        challenges.push(this.createEmailTokenChallenge());
        break;

      case 'SMS_CODE':
        challenges.push(this.createSMSCodeChallenge());
        break;

      case 'KNOWLEDGE_QUESTIONS':
        if (matches.length > 0) {
          const questions = await this.generateKnowledgeQuestions(matches[0]);
          challenges.push(...questions);
        }
        break;

      case 'MULTI_FACTOR':
        challenges.push(this.createEmailTokenChallenge());
        challenges.push(this.createSMSCodeChallenge());
        if (matches.length > 0) {
          const questions = await this.generateKnowledgeQuestions(matches[0]);
          challenges.push(questions[0]); // Add one knowledge question
        }
        break;

      case 'DOCUMENT_UPLOAD':
        challenges.push(this.createDocumentUploadChallenge());
        break;

      default:
        challenges.push(this.createEmailTokenChallenge());
    }

    return challenges;
  }

  /**
   * Create email token challenge
   */
  private createEmailTokenChallenge(): VerificationChallenge {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.config.tokenExpiryMinutes);

    return {
      id: crypto.randomUUID(),
      type: 'TOKEN',
      description: 'Email verification token',
      data: { token, method: 'email' },
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      expiresAt,
    };
  }

  /**
   * Create SMS code challenge
   */
  private createSMSCodeChallenge(): VerificationChallenge {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.config.smsCodeExpiryMinutes);

    return {
      id: crypto.randomUUID(),
      type: 'CODE',
      description: 'SMS verification code',
      data: { code, method: 'sms' },
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      expiresAt,
    };
  }

  /**
   * Create document upload challenge
   */
  private createDocumentUploadChallenge(): VerificationChallenge {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return {
      id: crypto.randomUUID(),
      type: 'DOCUMENT',
      description: 'Government ID verification',
      data: {
        acceptedTypes: ['passport', 'drivers_license', 'national_id'],
        requiresPhoto: true,
      },
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      expiresAt,
    };
  }

  /**
   * Generate knowledge questions based on customer data
   */
  private async generateKnowledgeQuestions(match: IdentityMatch): Promise<VerificationChallenge[]> {
    // This would generate questions based on customer data
    // For example: "What is your phone number?", "When did you first contact us?"
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    return [
      {
        id: crypto.randomUUID(),
        type: 'QUESTION',
        description: 'Security verification questions',
        data: {
          questions: [
            {
              id: 'phone_verification',
              question: 'Please provide the phone number associated with your account',
              type: 'text',
            },
            {
              id: 'recent_activity',
              question: 'When did you last update your information with us?',
              type: 'date',
            },
          ],
        },
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 2,
        expiresAt,
      },
    ];
  }

  /**
   * Helper methods
   */
  private async checkIPReputation(ipAddress: string): Promise<{
    suspicious: boolean;
    riskScore: number;
    reason: string;
  }> {
    // Placeholder - would integrate with threat intelligence services
    return {
      suspicious: false,
      riskScore: 0,
      reason: 'IP reputation check not implemented',
    };
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Result creation helpers
   */
  private createSuccessResult(verification: VerificationRequest): VerificationResult {
    return {
      success: true,
      verificationId: verification.id,
      customerId: verification.customerId,
      confidence: verification.confidence,
      method: verification.method,
      riskLevel: verification.riskLevel,
      message: 'Identity verified successfully',
      nextSteps: ['Identity confirmed', 'GDPR request will now be processed'],
    };
  }

  private createFailureResult(
    verificationId: string,
    message: string,
    errors?: string[]
  ): VerificationResult {
    return {
      success: false,
      verificationId,
      confidence: 0,
      method: 'EMAIL_TOKEN',
      riskLevel: 'HIGH',
      message,
      errors: errors || [message],
    };
  }

  /**
   * Placeholder methods
   */
  private async sendVerificationChallenges(
    verificationId: string,
    challenges: VerificationChallenge[]
  ): Promise<{ success: boolean; sent: number }> {
    // Implementation would send emails/SMS
    logger.info('Verification challenges sent', {
      verificationId,
      challengeCount: challenges.length,
    });

    return { success: true, sent: challenges.length };
  }

  private async verifyChallengeResponse(
    verification: VerificationRequest,
    challenge: VerificationChallenge,
    response: any,
    context?: any
  ): Promise<{
    success: boolean;
    confidence: number;
    customerId?: string;
    metadata: any;
    error?: string;
  }> {
    // Implementation would verify the specific challenge type
    // This is a placeholder that simulates successful verification

    if (challenge.type === 'TOKEN' && response.token === challenge.data.token) {
      return {
        success: true,
        confidence: 75,
        metadata: { method: 'email_token' },
      };
    }

    if (challenge.type === 'CODE' && response.code === challenge.data.code) {
      return {
        success: true,
        confidence: 85,
        metadata: { method: 'sms_code' },
      };
    }

    return {
      success: false,
      confidence: 0,
      metadata: { method: challenge.type.toLowerCase() },
      error: 'Invalid response',
    };
  }

  private generateNextSteps(challenges: VerificationChallenge[]): string[] {
    const steps: string[] = [];

    challenges.forEach(challenge => {
      switch (challenge.type) {
        case 'TOKEN':
          steps.push('Check your email for verification token');
          break;
        case 'CODE':
          steps.push('Enter SMS verification code');
          break;
        case 'QUESTION':
          steps.push('Answer security questions');
          break;
        case 'DOCUMENT':
          steps.push('Upload government ID document');
          break;
      }
    });

    return steps.length > 0 ? steps : ['Complete verification process'];
  }

  private async expireVerification(verificationId: string): Promise<void> {
    await prisma.verificationRequest.update({
      where: { id: verificationId },
      data: {
        status: 'EXPIRED',
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalVerificationService: GDPRIdentityVerificationService | null = null;

/**
 * Get global GDPR identity verification service instance
 */
export function getGDPRIdentityVerificationService(): GDPRIdentityVerificationService {
  if (!globalVerificationService) {
    globalVerificationService = new GDPRIdentityVerificationService();
  }
  return globalVerificationService;
}
