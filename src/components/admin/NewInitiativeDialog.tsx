import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INITIATIVE_TYPES, STAKEHOLDERS_LIST, InitiativeType } from '@/lib/adminDataManager';

export type NewInitiativeSubmitData = {
  unit: string;
  team: string;
  initiative: string;
  initiativeType: InitiativeType | '';
  stakeholdersList: string[];
  description: string;
  documentationLink: string;
  isTimelineStub?: boolean;
};

interface NewInitiativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: string[];
  teams: string[];
  defaultUnit?: string;
  defaultTeam?: string;
  onSubmit: (data: NewInitiativeSubmitData) => void;
}

const NewInitiativeDialog = ({
  open,
  onOpenChange,
  units,
  teams,
  defaultUnit = '',
  defaultTeam = '',
  onSubmit
}: NewInitiativeDialogProps) => {
  const [unit, setUnit] = useState(defaultUnit);
  const [team, setTeam] = useState(defaultTeam);
  const [initiative, setInitiative] = useState('');
  const [initiativeType, setInitiativeType] = useState<InitiativeType | ''>('');
  const [stakeholdersList, setStakeholdersList] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [documentationLink, setDocumentationLink] = useState('');
  const [isTimelineStub, setIsTimelineStub] = useState(false);

  // Sync with filter selection when dialog opens
  useEffect(() => {
    if (open) {
      setUnit(defaultUnit);
      setTeam(defaultTeam);
    }
  }, [open, defaultUnit, defaultTeam]);

  const handleSubmit = () => {
    if (!unit || !initiative) return;
    const payload: NewInitiativeSubmitData = {
      unit,
      team,
      initiative,
      initiativeType,
      stakeholdersList,
      description,
      documentationLink,
      isTimelineStub,
    };
    onSubmit(payload);
    // Reset form
    setInitiative('');
    setInitiativeType('');
    setStakeholdersList([]);
    setDescription('');
    setDocumentationLink('');
    setIsTimelineStub(false);
    onOpenChange(false);
  };

  const handleStakeholderToggle = (stakeholder: string, checked: boolean) => {
    setStakeholdersList(prev => 
      checked 
        ? [...prev, stakeholder]
        : prev.filter(s => s !== stakeholder)
    );
  };

  // Filter teams based on selected unit
  const availableTeams = unit ? teams : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          /* Не center translate-y-1/2: при длинном контенте нижняя часть уезжает за экран */
          'left-[50%] top-3 translate-x-[-50%] translate-y-0 sm:top-[6vh]',
          'flex max-h-[min(88dvh,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px]',
          'sm:rounded-lg'
        )}
      >
        <div className="shrink-0 space-y-1.5 border-b border-border/80 px-6 pb-4 pr-14 pt-6">
          <DialogTitle className="text-left">Новая инициатива</DialogTitle>
          <DialogDescription className="text-left">
            Создайте новую инициативу. Она будет добавлена с пустыми квартальными данными.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
        <div className="grid gap-4">
          {/* Unit */}
          <div className="grid gap-2">
            <Label htmlFor="unit">Unit *</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите юнит" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Team */}
          <div className="grid gap-2">
            <Label htmlFor="team">Team</Label>
            <Select value={team} onValueChange={setTeam} disabled={!unit}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите команду (опционально)" />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="initiative">Название инициативы *</Label>
            <Input
              id="initiative"
              value={initiative}
              onChange={(e) => setInitiative(e.target.value)}
              placeholder="Введите название"
            />
          </div>

          <OptionalInitiativeFields
            initiativeType={initiativeType}
            setInitiativeType={setInitiativeType}
            stakeholdersList={stakeholdersList}
            handleStakeholderToggle={handleStakeholderToggle}
            description={description}
            setDescription={setDescription}
            documentationLink={documentationLink}
            setDocumentationLink={setDocumentationLink}
            isTimelineStub={isTimelineStub}
            setIsTimelineStub={setIsTimelineStub}
          />
        </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!unit || !initiative}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type OptionalFieldsProps = {
  initiativeType: InitiativeType | '';
  setInitiativeType: (v: InitiativeType | '') => void;
  stakeholdersList: string[];
  handleStakeholderToggle: (stakeholder: string, checked: boolean) => void;
  description: string;
  setDescription: (v: string) => void;
  documentationLink: string;
  setDocumentationLink: (v: string) => void;
  isTimelineStub: boolean;
  setIsTimelineStub: (v: boolean) => void;
};

function OptionalInitiativeFields({
  initiativeType,
  setInitiativeType,
  stakeholdersList,
  handleStakeholderToggle,
  description,
  setDescription,
  documentationLink,
  setDocumentationLink,
  isTimelineStub,
  setIsTimelineStub,
}: OptionalFieldsProps) {
  return (
    <>
      <div className="grid gap-2">
        <Label>Тип инициативы</Label>
        <TooltipProvider>
          <Select value={initiativeType} onValueChange={(v) => setInitiativeType(v as InitiativeType | '')}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите тип" />
            </SelectTrigger>
            <SelectContent>
              {INITIATIVE_TYPES.map((type) => (
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

      <div className="grid gap-2">
        <Label>Stakeholders</Label>
        <div className="max-h-[min(9rem,28dvh)] overflow-y-auto overscroll-contain rounded-md border border-border/60 bg-muted/10 p-2">
          <div className="flex flex-wrap gap-1.5">
            {STAKEHOLDERS_LIST.map((stakeholder) => {
              const isSelected = stakeholdersList.includes(stakeholder);
              return (
                <label
                  key={stakeholder}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted'
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleStakeholderToggle(stakeholder, checked as boolean)}
                    className="sr-only"
                  />
                  {stakeholder}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Описание</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Краткое описание инициативы"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="docLink">Ссылка на документацию</Label>
        <Input
          id="docLink"
          value={documentationLink}
          onChange={(e) => setDocumentationLink(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <div className="min-w-0">
          <Label className="text-sm font-medium">Заглушка в таймлайне</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Показывать внизу таймлайна</p>
        </div>
        <Checkbox
          checked={isTimelineStub}
          onCheckedChange={(checked) => setIsTimelineStub(checked === true)}
          className="shrink-0"
        />
      </div>
    </>
  );
}

export default NewInitiativeDialog;
