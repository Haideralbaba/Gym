import React from 'react';

interface VoxaLogoProps {
  variant?: 'icon' | 'horizontal';
  size?: number;
  subtitle?: string;
}

/**
 * VOXA Geometric Emblem & Wordmark
 * Precision-cut architectural V-prism rendered in brushed metallic gold on obsidian.
 * Supports both standalone icon mark and horizontal brand lockup.
 */
export const VoxaLogo: React.FC<VoxaLogoProps> = ({ variant = 'horizontal', size = 36, subtitle }) => {
  const gradId = React.useId();
  const facetId = React.useId();

  const iconSvg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5E3A1" />
          <stop offset="48%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#997517" />
        </linearGradient>
        <linearGradient id={facetId} x1="32" y1="12" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBEBB6" />
          <stop offset="100%" stopColor="#B38B20" />
        </linearGradient>
      </defs>
      {/* Precision octagonal architectural frame */}
      <polygon
        points="21,4 43,4 60,21 60,43 43,60 21,60 4,43 4,21"
        fill="#0D0D12"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeOpacity="0.65"
      />
      {/* Left & right geometric V-prism blades */}
      <polygon points="15,17 23.5,17 32,38.5 27.8,48.5" fill={`url(#${gradId})`} />
      <polygon points="49,17 40.5,17 32,38.5 36.2,48.5" fill={`url(#${facetId})`} />
      {/* Lower keystone */}
      <polygon points="32,39.5 35.6,48.5 32,52.5 28.4,48.5" fill="#F9E9B0" />
      {/* Upper precision diamond */}
      <polygon points="32,14.5 35.2,19.5 32,24.5 28.8,19.5" fill={`url(#${gradId})`} />
    </svg>
  );

  if (variant === 'icon') {
    return iconSvg;
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '11px', userSelect: 'none' }}>
      {iconSvg}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: Math.round(size * 0.52) + 'px',
            letterSpacing: '0.22em',
            background: 'linear-gradient(135deg, #F6E6A9 0%, #D4AF37 52%, #A9831D 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            direction: 'ltr',
            unicodeBidi: 'isolate'
          }}
        >
          VOXA
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: '10.5px',
              color: 'var(--muted)',
              fontWeight: 500,
              marginTop: '3px',
              letterSpacing: '0.02em'
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
