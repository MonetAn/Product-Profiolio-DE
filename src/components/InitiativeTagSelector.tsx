import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  INITIATIVE_TAGS,
  normalizeInitiativeTags,
  type InitiativeTag,
} from '@/lib/initiativeTags';

type InitiativeTagSelectorProps = {
  value: readonly string[] | null | undefined;
  onChange: (tags: InitiativeTag[]) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
};

export function InitiativeTagSelector({
  value,
  onChange,
  disabled = false,
  className,
  compact = false,
}: InitiativeTagSelectorProps) {
  const selected = normalizeInitiativeTags(value);

  const toggle = (tag: InitiativeTag) => {
    const next = selected.includes(tag)
      ? selected.filter((item) => item !== tag)
      : [...selected, tag];
    onChange(normalizeInitiativeTags(next));
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {INITIATIVE_TAGS.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => toggle(tag)}
            className={cn(
              'inline-flex items-center rounded-full border text-left font-medium transition-colors',
              compact ? 'gap-1 px-2 py-1 text-[11px]' : 'gap-1.5 px-3 py-1.5 text-sm',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-foreground hover:bg-muted',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span>{tag}</span>
          </button>
        );
      })}
    </div>
  );
}
