type BrandLogoProps = {
  /** Pixel size of the square logo mark */
  size?: number;
  /** Show the gradient "POD" wordmark next to the mark */
  withWordmark?: boolean;
  /** Wordmark font size class, e.g. "text-sm" */
  wordmarkClassName?: string;
};

/**
 * POD brand logo: an artistic gradient mark of three stacked image layers
 * converging into one — representing batch image processing.
 */
export function BrandLogo({ size = 28, withWordmark = false, wordmarkClassName = "text-sm" }: BrandLogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="POD Logo"
        role="img"
      >
        <defs>
          <linearGradient id="pod-grad-a" x1="4" y1="44" x2="44" y2="4" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2563eb" />
            <stop offset="0.55" stopColor="#06b6d4" />
            <stop offset="1" stopColor="#34d399" />
          </linearGradient>
          <linearGradient id="pod-grad-b" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="pod-grad-c" x1="14" y1="14" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#a5f3fc" />
            <stop offset="1" stopColor="#67e8f9" />
          </linearGradient>
        </defs>

        {/* Back layer */}
        <rect x="4" y="12" width="32" height="32" rx="9" fill="url(#pod-grad-a)" opacity="0.55" />
        {/* Middle layer */}
        <rect x="9" y="7" width="33" height="33" rx="9" fill="url(#pod-grad-b)" opacity="0.85" />
        {/* Front layer */}
        <rect x="14" y="3" width="31" height="31" rx="9" fill="url(#pod-grad-a)" />

        {/* Aperture cutout: sun + mountain (image symbol) */}
        <circle cx="34" cy="11.5" r="3.2" fill="#ecfeff" opacity="0.95" />
        <path
          d="M19 28.5 26.5 18l5.5 7 3-3.5 5 7H19Z"
          fill="url(#pod-grad-c)"
          opacity="0.95"
        />
      </svg>

      {withWordmark ? (
        <span
          className={`bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text font-bold tracking-tight text-transparent ${wordmarkClassName}`}
        >
          POD
        </span>
      ) : null}
    </span>
  );
}
