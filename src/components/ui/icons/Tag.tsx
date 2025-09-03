import { type IconProps } from './X';

export function TagIcon({ className = 'w-6 h-6', size }: IconProps) {
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
      <path d="M12 2H2v10l10 10 10-10L12 2Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}
