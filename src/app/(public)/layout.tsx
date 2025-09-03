import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../../globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Review Runner - Review Request',
  description: 'Loading your review request...',
};

// Public layout without Clerk authentication
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-basewarm-50 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}