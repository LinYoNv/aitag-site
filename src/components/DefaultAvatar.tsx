"use client";

export default function DefaultAvatar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="32" fill="#1f2937" />
      <circle cx="32" cy="24" r="10" fill="#6b7280" />
      <path d="M14 54c0-9.9 8.1-16 18-16s18 6.1 18 16" fill="#6b7280" />
    </svg>
  );
}
