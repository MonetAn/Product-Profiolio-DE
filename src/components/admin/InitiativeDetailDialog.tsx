import { useState, useEffect } from 'react';
import { ExternalLink, Info, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AdminDataRow, AdminQuarterData, INITIATIVE_TYPES, STAKEHOLDERS_LIST, InitiativeType, validateTeamQuarterEffort } from '@/lib/adminDataManager';

// Required field label component
const RequiredLabel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Label className={`text-sm font-medium ${className}`}>
    {children} <span className="text-red-500">*</span>
  </Label>
);

// Hook for local field state with save-on-blur
function useBlurField<T extends string | number>(
  externalValue: T,
  onSave: (value: T) => void
) {
  const [localValue, setLocalValue] = useState<T>(externalValue);

  // Sync when external value changes (e.g. different initiative opened)
  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  const handleChange = (value: T) => setLocalValue(value);
  const handleBlur = () => onSave(localValue);

  return { value: localValue, onChange: handleChange, onBlur: handleBlur };
}

interface QuarterFieldsProps {
  initiativeId: string;
  quarter: string;
  qData: AdminQuarterData;
  allData: AdminDataRow[];
  initiative: AdminDataRow;
  onQuarterDataChange: (id: string, quarter: string, field: keyof AdminQuarterData, value: string | number | boolean) => void;
}

const QuarterFields = ({ initiativeId, quarter, qData, allData, initiative, onQuarterDataChange }: QuarterFieldsProps) => {
  const save = (field: keyof AdminQuarterData) => (value: string | number | boolean) =>
    onQuarterDataChange(initiativeId, quarter, field, value);

  const otherCosts = useBlurField(qData.otherCosts, save('otherCosts'));
  const metricPlan = useBlurField(qData.metricPlan, save('metricPlan'));
  const metricFact = useBlurField(qData.metricFact, save('metricFact'));
  const comment = useBlurField(qData.comment, save('comment'));
  const effort = useBlurField(qData.effortCoefficient || 0, save('effortCoefficient'));

  const totalCost = qData.cost + qData.otherCosts;
  const teamEffort = validateTeamQuarterEffort(allData, initiative.unit, initiative.team, quarter);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ₽`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K ₽`;
    return `${value} ₽`;
  };

  return (
    <div
      className={`rounded-lg border p-4 space-y-4 ${
        qData.onTrack ? 'border-border' : 'border-destructive/50 bg-destructive/5'
      }`}
    >
      {/* Quarter Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-lg">{quarter}</h4>
          {qData.support && (
            <Badge variant="secondary" className="text-xs">Поддержка</Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-medium">{formatCurrency(totalCost)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">On-Track</Label>
            <Switch
              checked={qData.onTrack}
              onCheckedChange={(checked) => onQuarterDataChange(initiativeId, quarter, 'onTrack', checked)}
            />
          </div>
        </div>
      </div>

      {/* Effort Coefficient */}
      <div className="space-y-2 p-3 rounded-md bg-muted/30">
        <Label className="text-xs text-muted-foreground">Коэффициент трудозатрат</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={effort.value || ''}
            onChange={(e) => effort.onChange(parseInt(e.target.value) || 0)}
            onBlur={effort.onBlur}
            min={0}
            max={100}
            className="w-20 h-8"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <div className={`text-xs ${teamEffort.isValid ? 'text-muted-foreground' : 'text-red-600'}`}>
          Команда {initiative.team} в {quarter}: {teamEffort.total}% из 100%
          {!teamEffort.isValid && ' ⚠ Превышение!'}
        </div>
      </div>

      {/* Quarter Fields */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cost (read-only) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Стоимость (из CSV)</Label>
          <Input value={formatCurrency(qData.cost)} disabled className="bg-muted/50" />
        </div>

        {/* Other Costs */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Доп. расходы</Label>
          <Input
            type="number"
            value={otherCosts.value || ''}
            onChange={(e) => otherCosts.onChange(parseFloat(e.target.value) || 0)}
            onBlur={otherCosts.onBlur}
            placeholder="0"
          />
        </div>

        {/* Metric Plan */}
        <div className="space-y-1">
          <RequiredLabel className="text-xs text-muted-foreground">План метрики</RequiredLabel>
          <Textarea
            value={metricPlan.value}
            onChange={(e) => metricPlan.onChange(e.target.value)}
            onBlur={metricPlan.onBlur}
            placeholder="Планируемое значение метрики..."
            className={`min-h-[60px] resize-y ${!qData.metricPlan?.trim() ? 'ring-2 ring-amber-400' : ''}`}
          />
        </div>

        {/* Metric Fact */}
        <div className="space-y-1">
          <RequiredLabel className="text-xs text-muted-foreground">Факт метрики</RequiredLabel>
          <Textarea
            value={metricFact.value}
            onChange={(e) => metricFact.onChange(e.target.value)}
            onBlur={metricFact.onBlur}
            placeholder="Фактическое значение метрики..."
            className={`min-h-[60px] resize-y ${!qData.metricFact?.trim() ? 'ring-2 ring-amber-400' : ''}`}
          />
        </div>
      </div>

      {/* Comment */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Комментарий</Label>
        <Textarea
          value={comment.value}
          onChange={(e) => comment.onChange(e.target.value)}
          onBlur={comment.onBlur}
          placeholder="Комментарии к кварталу..."
          className="min-h-[80px] resize-y"
        />
      </div>
    </div>
  );
};

interface InitiativeDetailDialogProps {
  initiative: AdminDataRow | null;
  allData: AdminDataRow[];
  quarters: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: (id: string, field: keyof AdminDataRow, value: string | string[] | number) => void;
  onQuarterDataChange: (id: string, quarter: string, field: keyof AdminQuarterData, value: string | number | boolean) => void;
}

const InitiativeDetailDialog = ({
  initiative,
  allData,
  quarters,
  open,
  onOpenChange,
  onDataChange,
  onQuarterDataChange,
}: InitiativeDetailDialogProps) => {
  const [localStakeholders, setLocalStakeholders] = useState<string[]>([]);

  // Top-level text fields with save-on-blur
  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localDocLink, setLocalDocLink] = useState('');

  useEffect(() => {
    if (initiative) {
      setLocalStakeholders(initiative.stakeholdersList || []);
      setLocalName(initiative.initiative || '');
      setLocalDescription(initiative.description || '');
      setLocalDocLink(initiative.documentationLink || '');
    }
  }, [initiative?.id]);

  if (!initiative) return null;

  const handleStakeholderToggle = (stakeholder: string, checked: boolean) => {
    const newList = checked
      ? [...localStakeholders, stakeholder]
      : localStakeholders.filter(s => s !== stakeholder);
    setLocalStakeholders(newList);
    onDataChange(initiative.id, 'stakeholdersList', newList);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{initiative.unit}</Badge>
            <span>→</span>
            <Badge variant="outline">{initiative.team}</Badge>
          </div>
          <DialogTitle className="text-xl">
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => onDataChange(initiative.id, 'initiative', localName)}
              className="text-xl font-semibold border-none px-0 h-auto focus-visible:ring-0"
              placeholder="Название инициативы"
            />
          </DialogTitle>
          <DialogDescription className="sr-only">
            Редактирование инициативы {initiative.initiative}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-4">
          {/* Initiative Type */}
          <div className="space-y-2">
            <RequiredLabel>Тип инициативы</RequiredLabel>
            <TooltipProvider delayDuration={100}>
              <Select
                value={initiative.initiativeType || ''}
                onValueChange={(v) => onDataChange(initiative.id, 'initiativeType', v)}
              >
                <SelectTrigger className={`w-full focus:ring-0 focus-visible:ring-0 ${!initiative.initiativeType ? 'ring-2 ring-amber-400' : ''}`}>
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {INITIATIVE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        {type.label}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info size={12} className="text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[200px]">
                            <p className="text-xs">{type.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TooltipProvider>
          </div>

          {/* Stakeholders */}
          <div className="space-y-2">
            <RequiredLabel>Стейкхолдеры</RequiredLabel>
            <div className={`flex flex-wrap gap-2 p-2 rounded-md transition-all ${
              localStakeholders.length === 0 ? 'ring-2 ring-amber-400 bg-amber-50/50' : ''
            }`}>
              {STAKEHOLDERS_LIST.map(stakeholder => {
                const isSelected = localStakeholders.includes(stakeholder);
                return (
                  <button
                    key={stakeholder}
                    type="button"
                    onClick={() => handleStakeholderToggle(stakeholder, !isSelected)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer transition-all text-sm ${
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    {isSelected && <Check size={14} className="flex-shrink-0" />}
                    {stakeholder}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <RequiredLabel>Описание</RequiredLabel>
            <Textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => onDataChange(initiative.id, 'description', localDescription)}
              placeholder="Подробное описание инициативы..."
              className={`min-h-[100px] resize-y ${!initiative.description?.trim() ? 'ring-2 ring-amber-400' : ''}`}
            />
          </div>

          {/* Documentation Link */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ссылка на документацию</Label>
            <div className="flex gap-2">
              <Input
                value={localDocLink}
                onChange={(e) => setLocalDocLink(e.target.value)}
                onBlur={() => onDataChange(initiative.id, 'documentationLink', localDocLink)}
                placeholder="https://..."
                className="flex-1"
              />
              {initiative.documentationLink && (
                <a
                  href={initiative.documentationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-10 h-10 rounded-md border border-input bg-background hover:bg-accent"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </div>

          <Separator />

          {/* Quarters */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Квартальные данные</Label>
            <div className="space-y-4">
              {quarters.map((quarter) => {
                const qData = initiative.quarterlyData[quarter] || {
                  cost: 0,
                  otherCosts: 0,
                  support: false,
                  onTrack: true,
                  metricPlan: '',
                  metricFact: '',
                  comment: '',
                  effortCoefficient: 0
                };

                return (
                  <QuarterFields
                    key={quarter}
                    initiativeId={initiative.id}
                    quarter={quarter}
                    qData={qData}
                    allData={allData}
                    initiative={initiative}
                    onQuarterDataChange={onQuarterDataChange}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InitiativeDetailDialog;
