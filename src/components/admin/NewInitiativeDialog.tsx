import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import { INITIATIVE_TYPES, STAKEHOLDERS_LIST, InitiativeType } from '@/lib/adminDataManager';

interface NewInitiativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: string[];
  teams: string[];
  defaultUnit?: string;
  defaultTeam?: string;
  onSubmit: (data: { 
    unit: string; 
    team: string; 
    initiative: string; 
    initiativeType: InitiativeType | '';
    stakeholdersList: string[];
    description: string; 
    documentationLink: string;
  }) => void;
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

  // Sync with filter selection when dialog opens
  useEffect(() => {
    if (open) {
      setUnit(defaultUnit);
      setTeam(defaultTeam);
    }
  }, [open, defaultUnit, defaultTeam]);

  const handleSubmit = () => {
    if (!unit || !initiative) return;
    onSubmit({ 
      unit, 
      team, 
      initiative, 
      initiativeType,
      stakeholdersList,
      description, 
      documentationLink 
    });
    // Reset form
    setInitiative('');
    setInitiativeType('');
    setStakeholdersList([]);
    setDescription('');
    setDocumentationLink('');
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Новая инициатива</DialogTitle>
          <DialogDescription>
            Создайте новую инициативу. Она будет добавлена с пустыми квартальными данными.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Unit */}
          <div className="grid gap-2">
            <Label htmlFor="unit">Unit *</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите юнит" />
              </SelectTrigger>
              <SelectContent>
                {units.map(u => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
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
                {availableTeams.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Initiative name */}
          <div className="grid gap-2">
            <Label htmlFor="initiative">Название инициативы *</Label>
            <Input
              id="initiative"
              value={initiative}
              onChange={(e) => setInitiative(e.target.value)}
              placeholder="Введите название"
            />
          </div>

          {/* Initiative Type */}
          <div className="grid gap-2">
            <Label>Тип инициативы</Label>
            <TooltipProvider>
              <Select value={initiativeType} onValueChange={(v) => setInitiativeType(v as InitiativeType | '')}>
                <SelectTrigger>
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
          <div className="grid gap-2">
            <Label>Stakeholders</Label>
            <div className="flex flex-wrap gap-2">
              {STAKEHOLDERS_LIST.map(stakeholder => {
                const isSelected = stakeholdersList.includes(stakeholder);
                return (
                  <label
                    key={stakeholder}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer transition-colors text-sm ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground border-primary' 
                        : 'bg-background hover:bg-muted border-border'
                    }`}
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

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Описание</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание инициативы"
            />
          </div>

          {/* Documentation Link */}
          <div className="grid gap-2">
            <Label htmlFor="docLink">Ссылка на документацию</Label>
            <Input
              id="docLink"
              value={documentationLink}
              onChange={(e) => setDocumentationLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <DialogFooter>
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

export default NewInitiativeDialog;
