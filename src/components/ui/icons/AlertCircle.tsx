import { type IconProps } from './X';

export function AlertCircleIcon({ className = 'w-6 h-6', size }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <path d="m12 16 .01 0" />
    </svg>
  );
}
