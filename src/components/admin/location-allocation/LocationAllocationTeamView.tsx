import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe2,
  GripVertical,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  locationTeamKey,
  sumTeamCostForYear,
} from '@/lib/locationAllocationPlanning';
import { formatLocationMillionsRub } from '@/lib/locationDisplayFormat';
import type { LocationAllocationTeamMetric } from '@/hooks/useLocationAllocationTeamMetrics';
import type { LocationAllocationGeoEditScope } from '@/lib/locationAllocationGeoEdit';
import {
  useLocationAllocationScenario,
  type LocationAllocationScenarioRegion,
  type LocationAllocationScenarioSourceTeam,
  type LocationAllocationScenarioTeamCardInput,
  type LocationAllocationScenarioTeam,
} from '@/hooks/useLocationAllocationScenario';
import { InitiativeAllocationComments } from './InitiativeAllocationComments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ALLOCATION_SCENARIO_UNITS,
  resolveAllocationScenarioUnit,
  normalizeAllocationScenarioUnit,
} from '@/lib/allocationScenarioUnits';
import { reorderAllocationScenarioTeamIds } from '@/lib/allocationScenarioOrder';
import { canManageAllocationScenarioTeams } from '@/lib/allocationScenarioPermissions';
import {
  ALLOCATION_SCENARIO_AREA_LABELS,
  ALLOCATION_SCENARIO_AREA_ORDER,
  type AllocationScenarioArea,
} from '@/lib/allocationScenarioAreas';
import { getTreemapUnitIcon } from '@/lib/treemapUnitIcons';
import { DrinkitBrandMark } from './DrinkitBrandMark';

type Props = {
  initiatives: AdminDataRow[];
  teamMetrics?: LocationAllocationTeamMetric[];
  readOnly?: boolean;
  selectedUnit?: string | null;
  onSelectedUnitChange: (unit: string) => void;
  focusedComment?: {
    id: string;
    replyId?: string | null;
    scope: LocationAllocationGeoEditScope;
  } | null;
};

type TeamPatch = Partial<
  Pick<
    LocationAllocationScenarioTeam,
    | 'name'
    | 'description'
    | 'runPercent'
    | 'runDescription'
    | 'sortOrder'
    | 'isArchived'
  >
>;

type AllocationKind = AllocationScenarioArea | 'RUN';

type TeamCardDraft = {
  description: string;
  runPercent: number;
  runDescription: string;
  regions: Record<
    AllocationScenarioArea,
    {
      percent: number;
      description: string;
    }
  >;
};

const ALLOCATION_APPEARANCE: Record<
  AllocationKind,
  {
    accent: string;
    tint: string;
    text: string;
  }
> = {
  'Domestic Region': {
    accent: '#FF4E00',
    tint: 'rgba(255, 78, 0, 0.045)',
    text: '#B73700',
  },
  'International Region': {
    accent: '#FF915F',
    tint: 'rgba(255, 145, 95, 0.07)',
    text: '#9B3F1D',
  },
  'Drink It': {
    accent: '#182DA8',
    tint: 'rgba(24, 45, 168, 0.045)',
    text: '#182DA8',
  },
  Platform: {
    accent: '#0F766E',
    tint: 'rgba(15, 118, 110, 0.055)',
    text: '#0F766E',
  },
  RUN: {
    accent: '#64748B',
    tint: 'rgba(100, 116, 139, 0.055)',
    text: '#475569',
  },
};

function allocationLabel(kind: AllocationKind): string {
  return kind === 'RUN' ? 'RUN' : ALLOCATION_SCENARIO_AREA_LABELS[kind];
}

function AllocationBrandMark({
  kind,
  size = 'md',
}: {
  kind: AllocationKind;
  size?: 'sm' | 'md';
}) {
  const appearance = ALLOCATION_APPEARANCE[kind];
  const className = cn(
    'relative inline-flex shrink-0 items-center justify-center rounded-md',
    size === 'sm' ? 'h-5 w-5' : 'h-8 w-8'
  );
  const iconClassName = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  if (kind === 'Domestic Region' || kind === 'International Region') {
    const isInternational = kind === 'International Region';
    return (
      <span className={className} style={{ backgroundColor: appearance.accent }}>
        <img
          src={`${import.meta.env.BASE_URL}brands/dodo-pizza-sign.png`}
          alt=""
          aria-hidden="true"
          className="h-full w-full rounded-[inherit] object-cover"
          style={
            isInternational
              ? { border: `2px solid ${appearance.accent}` }
              : undefined
          }
        />
        {isInternational ? (
          <span
            className={cn(
              'absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border-2 border-background shadow-sm',
              size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
            )}
            style={{ backgroundColor: appearance.accent, color: '#5E210E' }}
            aria-hidden="true"
          >
            <Globe2 className={size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
          </span>
        ) : null}
      </span>
    );
  }

  if (kind === 'Drink It') {
    return (
      <span
        className={className}
        style={{ backgroundColor: appearance.accent, color: '#FFFFFF' }}
      >
        <DrinkitBrandMark className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
      </span>
    );
  }

  const Icon = kind === 'Platform' ? Layers : RefreshCw;

  return (
    <span
      className={className}
      style={{
        backgroundColor: appearance.accent,
        color: '#FFFFFF',
      }}
    >
      <Icon className={iconClassName} aria-hidden="true" />
    </span>
  );
}

function pluralTeams(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} команд`;
  if (mod10 === 1) return `${count} команда`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} команды`;
  return `${count} команд`;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPeopleCount(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSignedRub(value: number): string {
  if (value === 0) return formatLocationMillionsRub(0);
  const sign = value > 0 ? '+' : '−';
  return `${sign}${formatLocationMillionsRub(Math.abs(value))}`;
}

function formatSignedPercent(value: number): string {
  if (value === 0) return '0%';
  const sign = value > 0 ? '+' : '−';
  return `${sign}${formatPercent(Math.abs(value))}%`;
}

function changeTone(value: number): string {
  if (value > 0) return 'text-emerald-700';
  if (value < 0) return 'text-rose-700';
  return 'text-muted-foreground';
}

function createTeamCardDraft(
  team: LocationAllocationScenarioTeam
): TeamCardDraft {
  return {
    description: team.description,
    runPercent: team.runPercent,
    runDescription: team.runDescription,
    regions: Object.fromEntries(
      ALLOCATION_SCENARIO_AREA_ORDER.map((region) => {
        const item = getRegion(team, region);
        return [
          region,
          {
            percent: item?.percent ?? 0,
            description: item?.description ?? '',
          },
        ];
      })
    ) as TeamCardDraft['regions'],
  };
}

function teamCardDraftEquals(
  left: TeamCardDraft,
  right: TeamCardDraft
): boolean {
  if (
    left.description !== right.description ||
    Math.abs(left.runPercent - right.runPercent) > 0.001 ||
    left.runDescription !== right.runDescription
  ) {
    return false;
  }
  return ALLOCATION_SCENARIO_AREA_ORDER.every(
    (region) =>
      Math.abs(
        left.regions[region].percent - right.regions[region].percent
      ) <= 0.001 &&
      left.regions[region].description === right.regions[region].description
  );
}

function NumberEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))));

  useEffect(() => {
    setDraft(String(Number(value.toFixed(2))));
  }, [value]);

  const normalizeDraft = () => {
    const next = Math.max(
      0,
      Math.min(100, Number(draft.replace(',', '.')) || 0)
    );
    setDraft(String(Number(next.toFixed(2))));
    onChange(next);
  };

  return (
    <div className="relative w-[88px]">
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const nextValue = Math.max(
            0,
            Math.min(100, Number(nextDraft.replace(',', '.')) || 0)
          );
          onChange(nextValue);
        }}
        onBlur={normalizeDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            normalizeDraft();
          }
        }}
        className="h-9 pr-7 text-right font-semibold tabular-nums"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        %
      </span>
    </div>
  );
}

function TextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Textarea
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
}

function getRegion(
  team: LocationAllocationScenarioTeam,
  region: AllocationScenarioArea
): LocationAllocationScenarioRegion | null {
  return team.regions.find((item) => item.region === region) ?? null;
}

function allocationAmount(
  team: LocationAllocationScenarioTeam,
  percent: number
): number {
  return team.fot2026Rub * (percent / 100);
}

function resolveTeamDropPosition(
  event: DragEvent<HTMLDivElement>
): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect();
  const boundary = rect.top + Math.min(rect.height / 2, 48);
  return event.clientY < boundary ? 'before' : 'after';
}

function AllocationSummary({
  team,
  className,
}: {
  team: LocationAllocationScenarioTeam;
  className?: string;
}) {
  const items = [
    ...ALLOCATION_SCENARIO_AREA_ORDER.map((region) => ({
      key: region,
      kind: region as AllocationKind,
      percent: getRegion(team, region)?.percent ?? 0,
    })),
    { key: 'run', kind: 'RUN' as AllocationKind, percent: team.runPercent },
  ];

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: ALLOCATION_APPEARANCE[item.kind].accent }}
            aria-hidden="true"
          />
          <span
            className="font-medium"
            style={{ color: ALLOCATION_APPEARANCE[item.kind].text }}
          >
            {allocationLabel(item.kind)}
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatLocationMillionsRub(allocationAmount(team, item.percent))}
          </span>
          <span className="tabular-nums text-muted-foreground">
            ({formatPercent(item.percent)}%)
          </span>
        </span>
      ))}
    </div>
  );
}

function AllocationBlock({
  kind,
  percent,
  description,
  team,
  editMode,
  className,
  onPercentChange,
  onDescriptionChange,
}: {
  kind: AllocationKind;
  percent: number;
  description: string;
  team: LocationAllocationScenarioTeam;
  editMode: boolean;
  className?: string;
  onPercentChange: (value: number) => void;
  onDescriptionChange: (value: string) => void;
}) {
  const label = allocationLabel(kind);
  const appearance = ALLOCATION_APPEARANCE[kind];

  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 border-t-[3px] p-4',
        className
      )}
      style={{
        borderTopColor: appearance.accent,
        background: `linear-gradient(135deg, ${appearance.tint}, transparent 45%), hsl(var(--background))`,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <AllocationBrandMark kind={kind} />
          <div className="min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: appearance.text }}
            >
              {label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tabular-nums">
                {formatLocationMillionsRub(allocationAmount(team, percent))}
              </span>
              {!editMode ? (
                <span className="text-sm tabular-nums text-muted-foreground">
                  ({formatPercent(percent)}%)
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {editMode ? (
          <NumberEditor
            value={percent}
            ariaLabel={`Процент ${label} команды ${team.name}`}
            onChange={onPercentChange}
          />
        ) : null}
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        {editMode ? (
          <TextEditor
            value={description}
            ariaLabel={`Описание ${label} команды ${team.name}`}
            placeholder={
              kind === 'RUN'
                ? 'Что входит в операционку команды? Чем больше процент, тем больше стоит расписать тут'
                : kind === 'Platform'
                  ? 'Что команда делает для всех регионов/концепций'
                : `Что команда делает для ${label}`
            }
            onChange={onDescriptionChange}
            className="min-h-[86px] resize-y bg-muted/20"
          />
        ) : (
          <p
            className={cn(
              'min-h-[40px] whitespace-pre-wrap text-sm leading-relaxed',
              description.trim() ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {description.trim() || '—'}
          </p>
        )}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  isExpanded,
  canManageTeamActions,
  editMode,
  isSaving,
  isDragging,
  dropPosition,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  updateTeam,
  archiveTeam,
  saveTeamCard,
  onDirtyStateChange,
  focusedCommentId,
  focusedReplyId,
  focusedCommentScope,
}: {
  team: LocationAllocationScenarioTeam;
  isExpanded: boolean;
  canManageTeamActions: boolean;
  editMode: boolean;
  isSaving: boolean;
  isDragging: boolean;
  dropPosition: 'before' | 'after' | null;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  updateTeam: (id: string, patch: TeamPatch) => Promise<unknown>;
  archiveTeam: (id: string) => Promise<unknown>;
  saveTeamCard: (
    input: LocationAllocationScenarioTeamCardInput
  ) => Promise<unknown>;
  onDirtyStateChange: (teamId: string, dirty: boolean) => void;
  focusedCommentId?: string | null;
  focusedReplyId?: string | null;
  focusedCommentScope?: LocationAllocationGeoEditScope | null;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [collapseConfirmOpen, setCollapseConfirmOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(team.name);
  const [draft, setDraft] = useState<TeamCardDraft>(() =>
    createTeamCardDraft(team)
  );
  const [isCardSaving, setIsCardSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const previousSavedDraftRef = useRef(createTeamCardDraft(team));
  const canReorder = editMode && canManageTeamActions;
  const commentsScope: LocationAllocationGeoEditScope =
    focusedCommentId && focusedCommentScope
      ? focusedCommentScope
      : {
          type: 'team',
          unit: team.sourceUnit ?? team.unit,
          team: team.sourceTeam ?? team.name,
        };
  const showsInitiativeComment = commentsScope.type === 'initiative';
  const savedDraft = createTeamCardDraft(team);
  const hasUnsavedChanges = !teamCardDraftEquals(draft, savedDraft);
  const displayedChangeRub =
    team.fotChangeRub ?? team.fot2026Rub - team.fot2025Rub;
  const displayedGrowthPercent =
    team.fotGrowthPercent ??
    (team.fot2025Rub > 0
      ? (displayedChangeRub / team.fot2025Rub) * 100
      : 0);

  useEffect(() => setRenameDraft(team.name), [team.name]);

  useEffect(() => {
    const nextSavedDraft = createTeamCardDraft(team);
    setDraft((current) =>
      teamCardDraftEquals(current, previousSavedDraftRef.current)
        ? nextSavedDraft
        : current
    );
    previousSavedDraftRef.current = nextSavedDraft;
  }, [team]);

  useEffect(() => {
    onDirtyStateChange(team.id, hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyStateChange, team.id]);

  useEffect(
    () => () => onDirtyStateChange(team.id, false),
    [onDirtyStateChange, team.id]
  );

  const discardDraft = () => {
    setDraft(createTeamCardDraft(team));
    setSaveFailed(false);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!hasUnsavedChanges) return true;
    setIsCardSaving(true);
    setSaveFailed(false);
    try {
      await saveTeamCard({
        id: team.id,
        description: draft.description,
        runPercent: draft.runPercent,
        runDescription: draft.runDescription,
        regions: ALLOCATION_SCENARIO_AREA_ORDER.map((region, sortOrder) => ({
          region,
          percent: draft.regions[region].percent,
          description: draft.regions[region].description,
          sortOrder,
        })),
      });
      return true;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setIsCardSaving(false);
    }
  };

  const requestToggle = () => {
    if (isExpanded && hasUnsavedChanges) {
      setCollapseConfirmOpen(true);
      return;
    }
    onToggle();
  };

  const previewTeam: LocationAllocationScenarioTeam = {
    ...team,
    description: draft.description,
    runPercent: draft.runPercent,
    runDescription: draft.runDescription,
    regions: ALLOCATION_SCENARIO_AREA_ORDER.map((region, sortOrder) => {
      const savedRegion = getRegion(team, region);
      return {
        id: savedRegion?.id ?? `${team.id}:${region}`,
        teamId: team.id,
        region,
        percent: draft.regions[region].percent,
        description: draft.regions[region].description,
        sortOrder,
      };
    }),
  };

  return (
    <div
      className="relative"
      onDragOver={canReorder ? onDragOver : undefined}
      onDrop={canReorder ? onDrop : undefined}
    >
      {canReorder && dropPosition === 'before' ? (
        <span className="pointer-events-none absolute -top-1.5 left-2 right-2 z-10 h-1 rounded-full bg-primary shadow-sm" />
      ) : null}
      <section
        className={cn(
          'rounded-xl border border-border bg-card shadow-sm transition-all',
          isDragging && 'scale-[0.995] opacity-45'
        )}
      >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className={cn(
          'grid cursor-pointer gap-5 px-4 py-4 outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(440px,1.15fr)] xl:items-center',
          isExpanded ? 'rounded-t-xl' : 'rounded-xl'
        )}
        onClick={requestToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            requestToggle();
          }
        }}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {canReorder ? (
              <button
                type="button"
                draggable={!isSaving}
                className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isSaving}
                aria-label={`Перетащить команду ${team.name}`}
                title="Перетащить команду"
                onClick={(event) => event.stopPropagation()}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            ) : null}
            <h3 className="truncate text-lg font-semibold">{team.name}</h3>
            {editMode && canManageTeamActions ? (
              <div onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={`Действия с командой ${team.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Переименовать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Стоимость 2026
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {formatLocationMillionsRub(team.fot2026Rub)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Стоимость 2025
              </p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-muted-foreground">
                {team.fot2025Rub > 0
                  ? formatLocationMillionsRub(team.fot2025Rub)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                vs PY
              </p>
              <p
                className={cn(
                  'mt-0.5 text-sm font-semibold tabular-nums',
                  changeTone(displayedChangeRub)
                )}
              >
                {formatSignedRub(displayedChangeRub)}{' '}
                <span className="font-medium">
                  ({formatSignedPercent(displayedGrowthPercent)})
                </span>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Люди 2026
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold tabular-nums">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {formatPeopleCount(team.peopleCount2026)}
              </p>
              {team.peopleCount2025 != null ? (
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  2025: {formatPeopleCount(team.peopleCount2025)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 xl:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Распределение стоимости 2026
          </p>
          <AllocationSummary
            team={editMode ? previewTeam : team}
            className="mt-1.5 xl:justify-end"
          />
        </div>
      </div>

      {isExpanded ? (
        <div className="rounded-b-xl border-t border-border bg-muted/[0.12] px-4 py-5 sm:px-5">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Описание команды
              </p>
              {editMode ? (
                <TextEditor
                  value={draft.description}
                  ariaLabel={`Описание команды ${team.name}`}
                  placeholder="Коротко опишите, чем занимается команда, какие ключевые проекты, какая зона ответственности"
                  onChange={(description) =>
                    setDraft((current) => ({ ...current, description }))
                  }
                  className="min-h-[112px] resize-y bg-background"
                />
              ) : (
                <p
                  className={cn(
                    'max-w-5xl whitespace-pre-wrap text-[15px] leading-7',
                    team.description.trim()
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {team.description.trim() || '—'}
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ALLOCATION_SCENARIO_AREA_ORDER.map((region) => {
                const item = draft.regions[region];
                return (
                  <AllocationBlock
                    key={region}
                    kind={region}
                    className={region === 'Platform' ? 'xl:col-span-2' : undefined}
                    percent={item.percent}
                    description={item.description}
                    team={team}
                    editMode={editMode}
                    onPercentChange={(percent) =>
                      setDraft((current) => ({
                        ...current,
                        regions: {
                          ...current.regions,
                          [region]: {
                            ...current.regions[region],
                            percent,
                          },
                        },
                      }))
                    }
                    onDescriptionChange={(description) =>
                      setDraft((current) => ({
                        ...current,
                        regions: {
                          ...current.regions,
                          [region]: {
                            ...current.regions[region],
                            description,
                          },
                        },
                      }))
                    }
                  />
                );
              })}
              <AllocationBlock
                kind="RUN"
                percent={draft.runPercent}
                description={draft.runDescription}
                team={team}
                editMode={editMode}
                onPercentChange={(runPercent) =>
                  setDraft((current) => ({ ...current, runPercent }))
                }
                onDescriptionChange={(runDescription) =>
                  setDraft((current) => ({ ...current, runDescription }))
                }
              />
            </div>

            {editMode ? (
              <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90">
                <div
                  role="status"
                  aria-live="polite"
                  className="flex min-w-0 items-center gap-2 text-sm"
                >
                  {isCardSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      <span className="font-medium">Сохраняем изменения…</span>
                    </>
                  ) : saveFailed ? (
                    <>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" />
                      <span>
                        <span className="font-medium text-destructive">
                          Не удалось сохранить.
                        </span>{' '}
                        <span className="text-muted-foreground">
                          Введённые данные не потеряны.
                        </span>
                      </span>
                    </>
                  ) : hasUnsavedChanges ? (
                    <>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                      <span className="font-medium">
                        Есть несохранённые изменения
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        Все изменения сохранены
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    disabled={!hasUnsavedChanges || isCardSaving}
                    onClick={() => void saveDraft()}
                  >
                    {isCardSaving ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Сохранить изменения
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="border-t border-border pt-5">
              {showsInitiativeComment ? (
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Обсуждение инициативы из уведомления
                </p>
              ) : null}
              <InitiativeAllocationComments
                scope={commentsScope}
                compact
                hideEmptyState
                focusedCommentId={focusedCommentId}
                focusedReplyId={focusedReplyId}
              />
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать команду</DialogTitle>
            <DialogDescription>
              Новое название изменится только в сценарии аллокаций.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter' && renameDraft.trim()) {
                void updateTeam(team.id, { name: renameDraft.trim() }).then(() =>
                  setRenameOpen(false)
                );
              }
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!renameDraft.trim() || isSaving}
              onClick={() =>
                void updateTeam(team.id, { name: renameDraft.trim() }).then(() =>
                  setRenameOpen(false)
                )
              }
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{team.name}» из сценария?</AlertDialogTitle>
            <AlertDialogDescription>
              Исходная команда и данные портфеля не изменятся. Удалится только
              её версия в этом представлении.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void archiveTeam(team.id)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={collapseConfirmOpen}
        onOpenChange={setCollapseConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Сохранить изменения в «{team.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              В карточке остались несохранённые данные. Можно сохранить их
              перед сворачиванием или отменить изменения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel disabled={isCardSaving}>
              Остаться
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={isCardSaving}
              onClick={() => {
                discardDraft();
                setCollapseConfirmOpen(false);
                onToggle();
              }}
            >
              Свернуть без сохранения
            </Button>
            <Button
              type="button"
              disabled={isCardSaving}
              onClick={() => {
                void saveDraft().then((saved) => {
                  if (!saved) return;
                  setCollapseConfirmOpen(false);
                  onToggle();
                });
              }}
            >
              {isCardSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Сохранить и свернуть
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </section>
      {canReorder && dropPosition === 'after' ? (
        <span className="pointer-events-none absolute -bottom-1.5 left-2 right-2 z-10 h-1 rounded-full bg-primary shadow-sm" />
      ) : null}
    </div>
  );
}

export function LocationAllocationTeamView({
  initiatives,
  teamMetrics = [],
  readOnly = false,
  selectedUnit = null,
  onSelectedUnitChange,
  focusedComment = null,
}: Props) {
  const metricByTeam = useMemo(() => {
    return new Map(
      teamMetrics.map((metric) => [
        locationTeamKey(metric.unit, metric.team),
        metric,
      ])
    );
  }, [teamMetrics]);

  const sourceTeams = useMemo<LocationAllocationScenarioSourceTeam[]>(() => {
    const rowsByTeam = new Map<string, AdminDataRow[]>();
    for (const row of initiatives) {
      const unit = row.unit.trim() || 'Без юнита';
      const team = row.team.trim() || 'Без команды';
      const key = locationTeamKey(unit, team);
      const bucket = rowsByTeam.get(key) ?? [];
      bucket.push(row);
      rowsByTeam.set(key, bucket);
    }
    return [...rowsByTeam.entries()]
      .map(([key, rows]) => {
        const first = rows[0];
        const sourceUnit = first.unit.trim() || 'Без юнита';
        const sourceTeam = first.team.trim() || 'Без команды';
        const scenarioUnit = normalizeAllocationScenarioUnit(sourceUnit);
        if (!scenarioUnit) return null;
        const metric = metricByTeam.get(key);
        return {
          unit: scenarioUnit,
          sourceUnit,
          sourceTeam,
          name: metric?.teamDisplayName ?? sourceTeam,
          fot2025Rub: metric?.fot2025Rub ?? sumTeamCostForYear(rows, 2025),
          fot2026Rub: metric?.fot2026Rub ?? sumTeamCostForYear(rows, 2026),
          runPercent: 0,
        };
      })
      .filter(
        (team): team is LocationAllocationScenarioSourceTeam => Boolean(team)
      )
      .sort(
        (a, b) =>
          ALLOCATION_SCENARIO_UNITS.indexOf(
            a.unit as (typeof ALLOCATION_SCENARIO_UNITS)[number]
          ) -
            ALLOCATION_SCENARIO_UNITS.indexOf(
              b.unit as (typeof ALLOCATION_SCENARIO_UNITS)[number]
            ) || a.name.localeCompare(b.name, 'ru')
      );
  }, [initiatives, metricByTeam]);

  const scenario = useLocationAllocationScenario({
    sourceTeams,
    enabled: true,
  });
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(
    () => new Set()
  );
  const [newTeamUnit, setNewTeamUnit] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [activeUnit, setActiveUnit] = useState(() =>
    resolveAllocationScenarioUnit(selectedUnit)
  );
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [draggedTeamId, setDraggedTeamId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    teamId: string;
    position: 'before' | 'after';
  } | null>(null);
  const [dirtyTeamIds, setDirtyTeamIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingUnitChange, setPendingUnitChange] = useState<string | null>(
    null
  );

  const handleDirtyStateChange = useCallback(
    (teamId: string, dirty: boolean) => {
      setDirtyTeamIds((current) => {
        const next = new Set(current);
        if (dirty) next.add(teamId);
        else next.delete(teamId);
        if (
          next.size === current.size &&
          [...next].every((id) => current.has(id))
        ) {
          return current;
        }
        return next;
      });
    },
    []
  );

  const applyUnitChange = useCallback(
    (unit: string) => {
      setActiveUnit(unit);
      setExpandedTeamIds(new Set());
      setDirtyTeamIds(new Set());
      setPendingUnitChange(null);
      if (normalizeAllocationScenarioUnit(selectedUnit) !== unit) {
        onSelectedUnitChange(unit);
      }
    },
    [onSelectedUnitChange, selectedUnit]
  );

  useEffect(() => {
    if (dirtyTeamIds.size === 0) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyTeamIds.size]);

  const groups = useMemo(() => {
    const byUnit = new Map<string, LocationAllocationScenarioTeam[]>();
    for (const team of scenario.teams) {
      const scenarioUnit = normalizeAllocationScenarioUnit(team.unit);
      if (!scenarioUnit) continue;
      const bucket = byUnit.get(scenarioUnit) ?? [];
      bucket.push(team);
      byUnit.set(scenarioUnit, bucket);
    }
    return ALLOCATION_SCENARIO_UNITS.map((unit) => ({
      unit,
      teams: (byUnit.get(unit) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')
      ),
    }));
  }, [scenario.teams]);

  const focusedTeamTarget = useMemo(() => {
    if (!focusedComment) return null;

    let sourceUnit: string | null = null;
    let sourceTeam: string | null = null;
    if (focusedComment.scope.type === 'team') {
      sourceUnit = focusedComment.scope.unit;
      sourceTeam = focusedComment.scope.team;
    } else if (focusedComment.scope.type === 'initiative') {
      const initiative = initiatives.find(
        (row) => row.id === focusedComment.scope.initiativeId
      );
      sourceUnit = initiative?.unit ?? null;
      sourceTeam = initiative?.team ?? null;
    } else {
      sourceUnit = focusedComment.scope.unit;
    }

    const unit = normalizeAllocationScenarioUnit(sourceUnit);
    if (!unit) return null;
    const group = groups.find((item) => item.unit === unit);
    const normalizedTeam = sourceTeam?.trim().toLocaleLowerCase('ru') ?? '';
    const team = normalizedTeam
      ? group?.teams.find((item) =>
          [item.sourceTeam, item.name].some(
            (candidate) =>
              candidate?.trim().toLocaleLowerCase('ru') === normalizedTeam
          )
        ) ?? null
      : null;

    return { unit, teamId: team?.id ?? null };
  }, [focusedComment, groups, initiatives]);

  useEffect(() => {
    if (groups.length === 0) return;
    const requestedUnit = resolveAllocationScenarioUnit(selectedUnit);
    const nextUnit =
      groups.find((group) => group.unit === requestedUnit)?.unit ??
      groups[0].unit;
    if (nextUnit !== activeUnit) {
      if (dirtyTeamIds.size > 0) {
        setPendingUnitChange(nextUnit);
      } else {
        setActiveUnit(nextUnit);
        setExpandedTeamIds(new Set());
      }
    }
  }, [activeUnit, dirtyTeamIds.size, groups, selectedUnit]);

  useEffect(() => {
    if (!focusedTeamTarget) return;
    if (focusedTeamTarget.unit !== activeUnit) {
      if (dirtyTeamIds.size > 0) {
        setPendingUnitChange(focusedTeamTarget.unit);
      } else {
        setActiveUnit(focusedTeamTarget.unit);
        setExpandedTeamIds(
          focusedTeamTarget.teamId
            ? new Set([focusedTeamTarget.teamId])
            : new Set()
        );
      }
      return;
    }
    if (!focusedTeamTarget.teamId) return;
    setExpandedTeamIds((current) => {
      if (current.has(focusedTeamTarget.teamId!)) return current;
      const next = new Set(current);
      next.add(focusedTeamTarget.teamId!);
      return next;
    });
  }, [activeUnit, dirtyTeamIds.size, focusedTeamTarget]);

  const activeGroup =
    groups.find((group) => group.unit === activeUnit) ?? groups[0];
  const ActiveUnitIcon =
    getTreemapUnitIcon(activeGroup?.unit ?? '') ?? Building2;
  const editMode = !readOnly && Boolean(activeGroup);
  const canManageActiveUnit =
    !readOnly && canManageAllocationScenarioTeams();
  const activeFot2025 =
    scenario.unitTotals.find((total) => total.unit === activeGroup?.unit)
      ?.fot2025Rub ??
    activeGroup?.teams.reduce((sum, team) => sum + team.fot2025Rub, 0) ??
    0;
  const activeFot2026 =
    scenario.unitTotals.find((total) => total.unit === activeGroup?.unit)
      ?.fot2026Rub ??
    activeGroup?.teams.reduce((sum, team) => sum + team.fot2026Rub, 0) ??
    0;
  const activeUnitTotal = scenario.unitTotals.find(
    (total) => total.unit === activeGroup?.unit
  );
  const activeChangeRub =
    activeUnitTotal?.fotChangeRub ?? activeFot2026 - activeFot2025;
  const activeGrowthPercent =
    activeUnitTotal?.fotGrowthPercent ??
    (activeFot2025 > 0 ? (activeChangeRub / activeFot2025) * 100 : 0);
  const activePeople2025 = activeUnitTotal?.peopleCount2025 ?? null;
  const activePeople2026 =
    activeUnitTotal?.peopleCount2026 ??
    activeGroup?.teams.reduce(
      (sum, team) => sum + team.peopleCount2026,
      0
    ) ??
    null;
  useEffect(() => {
    if (!editMode) {
      setDraggedTeamId(null);
      setDropTarget(null);
    }
  }, [editMode]);

  const resetDrag = () => {
    setDraggedTeamId(null);
    setDropTarget(null);
  };

  const dropTeam = (
    event: DragEvent<HTMLDivElement>,
    targetTeamId: string
  ) => {
    event.preventDefault();
    if (
      !activeGroup ||
      !draggedTeamId ||
      draggedTeamId === targetTeamId
    ) {
      resetDrag();
      return;
    }

    const position =
      dropTarget?.teamId === targetTeamId
        ? dropTarget.position
        : resolveTeamDropPosition(event);
    const currentTeamIds = activeGroup.teams.map((team) => team.id);
    const nextTeamIds = reorderAllocationScenarioTeamIds({
      teamIds: currentTeamIds,
      draggedTeamId,
      targetTeamId,
      position,
    });
    resetDrag();
    if (nextTeamIds.every((id, index) => id === currentTeamIds[index])) return;
    void scenario.reorderTeams({ teamIds: nextTeamIds });
  };

  if (scenario.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-14 text-center text-sm text-muted-foreground">
        Загружаем команды…
      </div>
    );
  }

  if (scenario.error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
        <p className="font-semibold text-destructive">
          Не удалось открыть команды
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {scenario.error.message}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Popover open={unitPickerOpen} onOpenChange={setUnitPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={unitPickerOpen}
                  className="h-auto min-w-[280px] justify-between gap-4 rounded-xl px-4 py-3 text-left shadow-sm sm:min-w-[340px]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ActiveUnitIcon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Юнит
                      </span>
                      <span className="block truncate text-lg font-semibold text-foreground">
                        {activeGroup?.unit ?? 'Выберите юнит'}
                      </span>
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(92vw,340px)] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Найти юнит…" />
                  <CommandList>
                    <CommandEmpty>Юнит не найден.</CommandEmpty>
                    <CommandGroup>
                      {groups.map((group) => {
                        const UnitIcon =
                          getTreemapUnitIcon(group.unit) ?? Building2;
                        return (
                          <CommandItem
                            key={group.unit}
                            value={group.unit}
                            onSelect={() => {
                              setUnitPickerOpen(false);
                              if (group.unit === activeUnit) return;
                              if (dirtyTeamIds.size > 0) {
                                setPendingUnitChange(group.unit);
                              } else {
                                applyUnitChange(group.unit);
                              }
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                activeGroup?.unit === group.unit
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            <UnitIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">
                              {group.unit}
                            </span>
                            <span className="ml-3 text-xs text-muted-foreground">
                              {group.teams.length}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
              <div className="text-right">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Стоимость 2025
                </p>
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  {activeFot2025 > 0
                    ? formatLocationMillionsRub(activeFot2025)
                    : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Стоимость 2026
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatLocationMillionsRub(activeFot2026)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  vs PY
                </p>
                <p
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    changeTone(activeChangeRub)
                  )}
                >
                  {formatSignedRub(activeChangeRub)}
                </p>
                <p
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    changeTone(activeGrowthPercent)
                  )}
                >
                  {formatSignedPercent(activeGrowthPercent)}
                </p>
              </div>
              {activePeople2026 != null ? (
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Люди 2025 → 2026
                  </p>
                  <p className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {activePeople2025 != null
                      ? `${formatPeopleCount(activePeople2025)} → `
                      : ''}
                    {formatPeopleCount(activePeople2026)}
                  </p>
                </div>
              ) : null}
              <span className="rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                {pluralTeams(activeGroup?.teams.length ?? 0)}
              </span>
              {editMode && canManageActiveUnit ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!activeGroup}
                  onClick={() => {
                    if (!activeGroup) return;
                    setNewTeamUnit(activeGroup.unit);
                    setNewTeamName('');
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Добавить команду
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {activeGroup ? (
          <section className="space-y-2.5">
            {activeGroup.teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isExpanded={expandedTeamIds.has(team.id)}
                canManageTeamActions={canManageActiveUnit}
                editMode={editMode}
                isSaving={scenario.isSaving}
                isDragging={draggedTeamId === team.id}
                dropPosition={
                  dropTarget?.teamId === team.id
                    ? dropTarget.position
                    : null
                }
                onToggle={() =>
                  setExpandedTeamIds((current) => {
                    const next = new Set(current);
                    if (next.has(team.id)) next.delete(team.id);
                    else next.add(team.id);
                    return next;
                  })
                }
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', team.id);
                  setDraggedTeamId(team.id);
                  setDropTarget(null);
                }}
                onDragOver={(event) => {
                  if (!draggedTeamId || draggedTeamId === team.id) {
                    if (dropTarget) setDropTarget(null);
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const position = resolveTeamDropPosition(event);
                  if (
                    dropTarget?.teamId !== team.id ||
                    dropTarget.position !== position
                  ) {
                    setDropTarget({ teamId: team.id, position });
                  }
                }}
                onDrop={(event) => dropTeam(event, team.id)}
                onDragEnd={resetDrag}
                updateTeam={(id, patch) => scenario.updateTeam({ id, patch })}
                archiveTeam={scenario.archiveTeam}
                saveTeamCard={scenario.saveTeamCard}
                onDirtyStateChange={handleDirtyStateChange}
                focusedCommentId={
                  focusedTeamTarget?.teamId === team.id
                    ? focusedComment?.id
                    : null
                }
                focusedReplyId={
                  focusedTeamTarget?.teamId === team.id
                    ? focusedComment?.replyId
                    : null
                }
                focusedCommentScope={
                  focusedTeamTarget?.teamId === team.id
                    ? focusedComment?.scope
                    : null
                }
              />
            ))}
          </section>
        ) : null}
      </div>

      <Dialog
        open={Boolean(newTeamUnit)}
        onOpenChange={(open) => {
          if (!open) setNewTeamUnit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая команда</DialogTitle>
            <DialogDescription>
              Команда появится только в сценарии аллокаций внутри юнита{' '}
              {newTeamUnit}.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTeamName}
            onChange={(event) => setNewTeamName(event.target.value)}
            placeholder="Название команды"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newTeamUnit && newTeamName.trim()) {
                void scenario
                  .createTeam({ unit: newTeamUnit, name: newTeamName.trim() })
                  .then(() => setNewTeamUnit(null));
              }
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewTeamUnit(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!newTeamUnit || !newTeamName.trim() || scenario.isSaving}
              onClick={() => {
                if (!newTeamUnit || !newTeamName.trim()) return;
                void scenario
                  .createTeam({ unit: newTeamUnit, name: newTeamName.trim() })
                  .then(() => setNewTeamUnit(null));
              }}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingUnitChange)}
        onOpenChange={(open) => {
          if (open) return;
          setPendingUnitChange(null);
          onSelectedUnitChange(activeUnit);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Перейти в другой юнит?</AlertDialogTitle>
            <AlertDialogDescription>
              {dirtyTeamIds.size === 1
                ? 'В одной карточке остались несохранённые изменения.'
                : `В ${dirtyTeamIds.size} карточках остались несохранённые изменения.`}{' '}
              Сохраните их перед переходом или продолжите без сохранения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Остаться</AlertDialogCancel>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!pendingUnitChange) return;
                applyUnitChange(pendingUnitChange);
              }}
            >
              Перейти без сохранения
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
