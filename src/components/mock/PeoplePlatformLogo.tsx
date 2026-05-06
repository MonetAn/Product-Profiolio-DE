import { useId } from 'react';

/**
 * Логотип People Platform / Tempo — SVG из Figma (маска + внутренние тени + радиальный градиент).
 * `useId()` подставляет уникальные id в `mask` / `filter` / `gradient`, чтобы не конфликтовать при нескольких экземплярах.
 */
export function PeoplePlatformLogo({ size = 32, className }: { size?: number; className?: string }) {
  const rid = useId().replace(/:/g, '');
  const maskId = `${rid}-pp-logo-mask`;
  const filterId = `${rid}-pp-logo-filter`;
  const gradId = `${rid}-pp-logo-grad`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <mask
        id={maskId}
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="32"
        height="32"
      >
        <path
          d="M32 16C32 24.8366 24.8366 32 16 32L5.22449 32C2.33908 32 -2.04489e-07 29.6609 -4.56739e-07 26.7755L-2.34079e-06 5.22449C-2.59304e-06 2.33908 2.33908 -1.22166e-06 5.22449 -1.47391e-06L16 -2.41593e-06C24.8366 -3.18845e-06 32 7.16344 32 16Z"
          fill="#F7FF96"
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <g filter={`url(#${filterId})`}>
          <path
            d="M32.3359 32L-0.000198364 32L-0.000199358 20.6367L-0.000199946 13.9048L-0.000200637 6L-0.000201162 -9.87782e-07L32.3359 -3.8147e-06L32.3359 32Z"
            fill={`url(#${gradId})`}
          />
        </g>
      </g>
      <defs>
        <filter
          id={filterId}
          x="0"
          y="0"
          width="32.3359"
          height="32"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="5.48571" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha2"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="0.914286" />
          <feComposite in2="hardAlpha2" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
          <feBlend mode="normal" in2="effect1_innerShadow" result="effect2_innerShadow" />
        </filter>
        <radialGradient
          id={gradId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(49.3637 -35.8319 30.6672 35.2244 -12.2412 40.4034)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.210655" stopColor="#182DA8" />
          <stop offset="0.433261" stopColor="#E2278C" />
          <stop offset="0.733935" stopColor="#FF6800" />
          <stop offset="0.922976" stopColor="#FFF03C" />
        </radialGradient>
      </defs>
    </svg>
  );
}
