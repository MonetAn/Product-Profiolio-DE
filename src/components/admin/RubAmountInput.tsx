import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatRubAmountInput, parseRubAmountInput } from '@/lib/rubAmountInput';
import { cn } from '@/lib/utils';

const NO_SPINNER_CLASS =
  '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

interface RubAmountInputProps {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
}

/** Поле суммы в рублях: без стрелок, с разделением тысяч пробелами. */
export function RubAmountInput({
  value,
  onChange,
  onBlur,
  placeholder = '0',
  className,
  disabled,
  onClick,
}: RubAmountInputProps) {
  const [display, setDisplay] = useState(() => formatRubAmountInput(value));

  useEffect(() => {
    setDisplay(formatRubAmountInput(value));
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      value={display}
      placeholder={placeholder}
      className={cn('tabular-nums', NO_SPINNER_CLASS, className)}
      onChange={(e) => {
        const parsed = parseRubAmountInput(e.target.value);
        onChange(parsed);
        setDisplay(parsed > 0 ? formatRubAmountInput(parsed) : '');
      }}
      onBlur={onBlur}
      onClick={onClick}
    />
  );
}
