import { useState, useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EffortInputProps {
  value: number;
  expectedValue?: number; // From initiative's effortCoefficient
  isAuto: boolean;
  isVirtual?: boolean;
  onChange: (value: number) => void;
  className?: string;
}

export default function EffortInput({ 
  value, 
  expectedValue,
  isAuto, 
  isVirtual = false, 
  onChange, 
  className 
}: EffortInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Show empty string for zero values when editing starts
  const [localValue, setLocalValue] = useState(value === 0 ? '' : value.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Determine what to display
  const displayValue = value > 0 ? value : (expectedValue || 0);
  const isUsingExpected = value === 0 && expectedValue && expectedValue > 0;
  const hasManualOverride = value > 0 && expectedValue && expectedValue > 0 && value !== expectedValue;
  
  useEffect(() => {
    // Only update local value when not editing
    if (!isEditing) {
      setLocalValue(value === 0 ? '' : value.toString());
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = () => {
    // When starting to edit, if value is 0, show empty field
    setLocalValue(value === 0 ? '' : value.toString());
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const numValue = parseInt(localValue) || 0;
    const clampedValue = Math.max(0, Math.min(100, numValue));
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
    setLocalValue(clampedValue === 0 ? '' : clampedValue.toString());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setLocalValue(value === 0 ? '' : value.toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn("w-14 h-7 text-center text-xs", className)}
        min={0}
        max={100}
        step={5}
        placeholder={expectedValue ? expectedValue.toString() : undefined}
      />
    );
  }

  // No value and no expected — show empty placeholder
  const isEmpty = displayValue === 0;

  // Build tooltip
  let tooltip = '';
  if (isEmpty) {
    tooltip = 'Нажмите чтобы ввести значение';
  } else if (isUsingExpected) {
    tooltip = 'Значение из инициативы';
  } else if (hasManualOverride) {
    tooltip = `Изменено вручную (исходное: ${expectedValue}%)`;
  } else if (isAuto) {
    tooltip = 'Авто (из инициативы)';
  } else {
    tooltip = 'Изменено вручную';
  }

  return (
    <button
      onClick={handleStartEditing}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
        "hover:bg-muted cursor-pointer min-w-[50px] justify-center",
        // Empty state — dashed border
        isEmpty && "border border-dashed border-muted-foreground/30 text-muted-foreground/50",
        // Using expected value (gray, muted)
        isUsingExpected && "text-muted-foreground bg-muted/50",
        // Manual override — primary style
        hasManualOverride && "text-foreground bg-primary/10 border border-primary/20",
        // Regular manual entry (no expected to compare)
        !isEmpty && !isUsingExpected && !hasManualOverride && !isAuto && "text-foreground bg-primary/10 border border-primary/20",
        // Auto value
        !isEmpty && !isUsingExpected && !hasManualOverride && isAuto && "text-muted-foreground",
        className
      )}
      title={tooltip}
    >
      {isEmpty ? (
        <span>—</span>
      ) : (
        <>
          <span>{displayValue}%</span>
          {hasManualOverride && (
            <>
              <Pencil className="h-3 w-3" />
              <span className="text-muted-foreground/60 text-[10px]">({expectedValue}%)</span>
            </>
          )}
          {!isEmpty && !isUsingExpected && !hasManualOverride && !isAuto && (
            <Pencil className="h-3 w-3" />
          )}
        </>
      )}
    </button>
  );
}
