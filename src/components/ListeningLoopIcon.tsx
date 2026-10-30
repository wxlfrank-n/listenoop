import {memo, useId} from 'react';
import {useT} from '../i18n';

interface ListeningLoopIconProps {
  size?: number | string;
  className?: string;
  /** Overrides the translated default (rarely needed). */
  title?: string;
}

export const ListeningLoopIcon = memo(
  ({size = 150, className, title}: ListeningLoopIconProps) => {
    const t = useT();
    const label = title ?? t('app.listeningLoopIcon');
    /*
     * Unique IDs are important if several icons are rendered
     * on the same page. Otherwise SVG gradient IDs collide.
     */
    const id = useId().replace(/:/g, '');

    const bgGradient = `${id}-bg`;
    const loopGradient = `${id}-loop`;
    const waveGradient = `${id}-wave`;

    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 150 150"
        role="img"
        aria-label={label}
      >
        <defs>
          {/* Theme-aware background */}
          <linearGradient
            id={bgGradient}
            x1="0"
            y1="0"
            x2="0"
            y2="150"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="var(--bg-secondary)" />
            <stop offset="1" stopColor="var(--bg-primary)" />
          </linearGradient>

          {/* Brand / accent loop */}
          <linearGradient
            id={loopGradient}
            x1="35"
            y1="94"
            x2="115"
            y2="57"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="var(--accent-dim)" />
            <stop offset="0.5" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>

          {/* Waveform */}
          <linearGradient
            id={waveGradient}
            x1="75"
            y1="17"
            x2="75"
            y2="133"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="var(--text-primary)" />
            <stop offset="1" stopColor="var(--text-secondary)" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect
          x="3"
          y="3"
          width="144"
          height="144"
          rx="28"
          fill={`url(#${bgGradient})`}
        />

        {/* Top waveform */}
        <g fill={`url(#${waveGradient})`}>
          <rect x="33" y="37" width="6" height="11" rx="3" />
          <rect x="46" y="30" width="6" height="18" rx="3" />
          <rect x="59" y="22" width="6" height="26" rx="3" />
          <rect x="72" y="16" width="6" height="32" rx="3" />
          <rect x="85" y="22" width="6" height="26" rx="3" />
          <rect x="98" y="30" width="6" height="18" rx="3" />
          <rect x="111" y="37" width="6" height="11" rx="3" />
        </g>

        {/*
         * Cute waveform "ears".
         *
         * Shorter and slightly separated from the loop.
         */}
        <g fill={`url(#${waveGradient})`}>
          <rect x="13" y="67" width="6" height="16" rx="3" />
          <rect x="22" y="62" width="6" height="26" rx="3" />

          <rect x="122" y="62" width="6" height="26" rx="3" />
          <rect x="131" y="67" width="6" height="16" rx="3" />
        </g>

        {/* Central infinity / listening loop */}
        <path
          d="
            M75 75
            C65 64 56 59 48 61
            C39 63 35 70 36 78
            C37 87 46 93 55 90
            C63 88 69 81 75 75

            C81 69 87 62 95 60
            C104 58 113 64 114 73
            C116 82 111 90 103 92
            C94 94 85 87 75 75

            C65 86 56 93 47 91
            C39 89 34 81 36 72
            C38 63 47 57 56 60
            C64 62 70 69 75 75
          "
          fill="none"
          stroke={`url(#${loopGradient})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Bottom waveform */}
        <g fill={`url(#${waveGradient})`}>
          <rect x="33" y="103" width="6" height="10" rx="3" />
          <rect x="46" y="103" width="6" height="16" rx="3" />
          <rect x="59" y="103" width="6" height="24" rx="3" />
          <rect x="72" y="103" width="6" height="31" rx="3" />
          <rect x="85" y="103" width="6" height="24" rx="3" />
          <rect x="98" y="103" width="6" height="16" rx="3" />
          <rect x="111" y="103" width="6" height="10" rx="3" />
        </g>
      </svg>
    );
  },
);
