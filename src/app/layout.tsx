import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { ConditionalNavigation } from '@/components/ui/ConditionalNavigation';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Review Runner - Automated Review Requests for UK Businesses',
  description:
    'Send personalized SMS and email review requests to customers with tracking and analytics.',
  keywords: 'reviews, SMS, email, UK business, customer feedback, automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.className} bg-basewarm-50 min-h-screen`}>
          <OnboardingProvider>
            <ConditionalNavigation />
            {children}
          </OnboardingProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
