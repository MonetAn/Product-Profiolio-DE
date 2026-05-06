import { ConfigProvider, DatePicker } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { cn } from '@/lib/utils';
import { antSemanticPointerStyles } from '@/lib/antPickerPointerStyles';

dayjs.locale('ru');

type Size = 'small' | 'middle' | 'large';

export type AntDayDatePickerProps = {
  /** `YYYY-MM-DD` или пустая строка */
  value: string;
  onChange: (next: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  allowClear?: boolean;
  size?: Size;
  placeholder?: string;
};

/** Один календарный день: только выбор из панели (как квартальный RangePicker в quick flow). */
export function AntDayDatePicker({
  value,
  onChange,
  className,
  disabled,
  id,
  allowClear = true,
  size = 'middle',
  placeholder,
}: AntDayDatePickerProps) {
  return (
    <ConfigProvider locale={ruRU}>
      <DatePicker
        id={id}
        size={size}
        className={cn('min-w-0', className)}
        value={value ? dayjs(value) : null}
        onChange={(d: Dayjs | null) => onChange(d ? d.format('YYYY-MM-DD') : '')}
        format="DD.MM.YYYY"
        inputReadOnly
        disabled={disabled}
        allowClear={allowClear}
        placeholder={placeholder}
        styles={antSemanticPointerStyles(Boolean(disabled))}
        getPopupContainer={() => document.body}
      />
    </ConfigProvider>
  );
}
