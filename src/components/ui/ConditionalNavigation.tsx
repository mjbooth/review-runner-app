'use client';

import { usePathname } from 'next/navigation';
import { TopNavigation } from './TopNavigation';

export function ConditionalNavigation() {
  const pathname = usePathname();

  // Hide navigation on auth pages and tracking URLs
  const isAuthPage = pathname.startsWith('/auth/');
  const isTrackingUrl = pathname.startsWith('/r/');

  if (isAuthPage || isTrackingUrl) {
    return null;
  }

  return <TopNavigation />;
}
