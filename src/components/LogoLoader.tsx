import './LogoLoader.css';
import { cn } from '@/lib/utils';

const VIEWBOX = '0 0 206 206';

const PETALS: { d: string; className: string }[] = [
  {
    d: 'M81.0165 205.386L101.886 104.084V104.081H101.182L0 124.919C8.41438 165.401 40.432 197.234 81.0165 205.386Z',
    className: 'logo-loader-petal logo-loader-petal-1',
  },
  {
    d: 'M19.2422 40.5999L62.6816 84.0314C66.9013 75.7876 73.6423 69.0477 81.8875 64.8287L38.4494 21.3985C31.2398 26.9327 24.7782 33.3924 19.2422 40.5999Z',
    className: 'logo-loader-petal logo-loader-petal-2',
  },
  {
    d: 'M88.0888 0.866822V62.2344C92.444 60.7942 97.1 60.0147 101.938 60.0147C106.578 60.0147 111.05 60.7316 115.25 62.0605V0.895011C110.771 0.304641 106.202 0 101.562 0C96.9958 0 92.4988 0.294946 88.0888 0.866822Z',
    className: 'logo-loader-petal logo-loader-petal-3',
  },
  {
    d: 'M183.974 40.7209L141.011 83.6762C136.719 75.4757 129.92 68.7938 121.631 64.6476L164.795 21.4915C171.996 27.036 178.448 33.505 183.974 40.7209Z',
    className: 'logo-loader-petal logo-loader-petal-4',
  },
  {
    d: 'M204.423 90.2308H143.789C145.23 94.5852 146.009 99.2404 146.009 104.078C146.009 108.717 145.292 113.188 143.963 117.387L204.397 117.387C204.987 112.912 205.291 108.347 205.291 103.711C205.291 99.1424 204.996 94.6431 204.423 90.2308Z',
    className: 'logo-loader-petal logo-loader-petal-5',
  },
  {
    d: 'M183.887 166.814C178.352 174.022 171.891 180.482 164.681 186.017L121.985 143.329C130.231 139.11 136.972 132.371 141.193 124.128L183.887 166.814Z',
    className: 'logo-loader-petal logo-loader-petal-6',
  },
];

export interface LogoLoaderProps {
  className?: string;
  size?: number;
}

/**
 * Branded loading indicator: logo with sequential opacity pulse (wave).
 * Uses foreground color (works in light/dark). Respects prefers-reduced-motion.
 */
export function LogoLoader({ className, size = 32 }: LogoLoaderProps) {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      className={cn('inline-flex shrink-0 text-foreground', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-hidden
      >
        {PETALS.map(({ d, className: pathClass }) => (
          <path
            key={d.slice(0, 20)}
            fillRule="evenodd"
            clipRule="evenodd"
            d={d}
            fill="currentColor"
            className={pathClass}
          />
        ))}
      </svg>
    </div>
  );
}
