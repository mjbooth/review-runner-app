'use client';

import Link from 'next/link';
import Image from 'next/image';

export function AuthHeader() {
  return (
    <nav className="absolute top-0 left-0 right-0 z-50 bg-transparent">
      <div className="max-w-1440 mx-auto px-4 md:px-6 lg:px-8 xl:px-10 min-[1440px]:px-12">
        <div className="flex justify-between items-center h-16 md:h-18 lg:h-20">
          {/* Logo and brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3">
              <Image
                src="/ReviewRunner-WebLogo.svg"
                alt="Review Runner"
                width={48}
                height={48}
                className="w-8 h-8 md:w-10 md:h-10 lg:w-24 lg:h-12"
              />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
