export function AnarLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="anar-prism-grad"
          x1="4"
          y1="4"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="55%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>
      </defs>
      <path
        d="M15.1 3.6C15.5 2.8 16.5 2.8 16.9 3.6L28.3 25.9C28.7 26.7 28.1 27.6 27.2 27.6H21.2C20.5 27.6 19.9 27.2 19.6 26.6L16 19.1L12.4 26.6C12.1 27.2 11.5 27.6 10.8 27.6H4.8C3.9 27.6 3.3 26.7 3.7 25.9L15.1 3.6Z"
        fill="url(#anar-prism-grad)"
      />
      <path d="M16 10.4L19.4 17.6H12.6L16 10.4Z" fill="#0D0B14" fillOpacity="0.88" />
    </svg>
  );
}

export function ArenaSparkleMark({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="arena-star-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="arena-star-fill"
          x1="16"
          y1="12"
          x2="48"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#arena-star-glow)" />
      <path
        d="M32 10C33.4 22.8 41.2 30.6 54 32C41.2 33.4 33.4 41.2 32 54C30.6 41.2 22.8 33.4 10 32C22.8 30.6 30.6 22.8 32 10Z"
        fill="url(#arena-star-fill)"
      />
    </svg>
  );
}
