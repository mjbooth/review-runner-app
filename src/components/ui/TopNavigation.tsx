'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Analytics', href: '/analytics' },
  { name: 'Settings', href: '/settings' },
];

export function TopNavigation() {
  const pathname = usePathname();
  const { user } = useUser();

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-1440 mx-auto px-4 md:px-6 lg:px-8 xl:px-10 min-[1440px]:px-12">
        <div className="flex justify-between items-center h-16 md:h-18 lg:h-20">
          {/* Logo and brand */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-3">
              <Image
                src="/ReviewRunner-WebLogo.svg"
                alt="Review Runner"
                width={48}
                height={48}
                className="w-8 h-8 md:w-10 md:h-10 lg:w-24 lg:h-12"
              />
            </Link>
          </div>

          {/* Navigation items */}
          <div className="hidden md:block">
            <div className="ml-6 md:ml-8 lg:ml-10 flex items-baseline space-x-3 md:space-x-4 lg:space-x-6">
              {navigation.map(item => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'px-2 md:px-3 lg:px-4 py-2 rounded-md text-sm md:text-sm lg:text-base font-medium transition-colors duration-200',
                      isActive
                        ? 'bg-forgedorange-50 text-forgedorange-700'
                        : 'text-charcoal hover:text-charcoal hover:bg-gray-50'
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Business Switcher and User menu */}
          <div className="flex items-center space-x-4">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: 'w-8 h-8',
                },
              }}
            />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden ml-2">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-forgedorange-500"
              aria-controls="mobile-menu"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              <svg
                className="block h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      <div className="md:hidden" id="mobile-menu">
        <div className="px-4 md:px-6 lg:px-8 xl:px-10 min-[1440px]:px-12 pt-2 pb-3 space-y-1 border-t border-gray-200">
          {navigation.map(item => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-forgedorange-50 text-forgedorange-700'
                    : 'text-charcoal hover:text-charcoal hover:bg-gray-50'
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
