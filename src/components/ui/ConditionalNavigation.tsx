'use client';

import { usePathname } from 'next/navigation';
import { TopNavigation } from './TopNavigation';

export function ConditionalNavigation() {
  const pathname = usePathname();

  // Hide navigation on auth pages
  const isAuthPage = pathname.startsWith('/auth/');

  if (isAuthPage) {
    return null;
  }

  return <TopNavigation />;
}
