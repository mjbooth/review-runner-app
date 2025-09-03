/**
 * Simple utility for adding authentication headers to API requests
 * Simplified authentication for client-side API requests
 */

/**
 * Add standard authentication headers for API requests
 * Clerk authentication is handled via cookies which are automatically included
 */
export function addAuthHeaders(headers: HeadersInit = {}): HeadersInit {
  // Clerk uses httpOnly cookies for authentication in Next.js
  // These are automatically included in same-origin requests
  // No additional headers needed
  return headers;
}

/**
 * Get authentication headers for API requests
 * Alias for addAuthHeaders for consistency with onboarding service
 */
export async function getAuthHeaders(headers: HeadersInit = {}): Promise<HeadersInit> {
  return addAuthHeaders(headers);
}
