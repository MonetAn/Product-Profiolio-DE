import { useState, useMemo } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePeople, usePeopleMutations } from '@/hooks/usePeople';
import { useInitiatives } from '@/hooks/useInitiatives';
import { useToast } from '@/hooks/use-toast';

interface UnitTeamMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Mismatch {
  type: 'unit' | 'team';
  initiativeValue: string;
  peopleValue: string;
  peopleCount: number;
}

export default function UnitTeamMappingDialog({ open, onOpenChange }: UnitTeamMappingDialogProps) {
  const { data: people = [] } = usePeople();
  const { data: initiatives = [] } = useInitiatives();
  const { bulkUpdateUnit, bulkUpdateTeam } = usePeopleMutations();
  const { toast } = useToast();
  
  const [applying, setApplying] = useState<string | null>(null);

  // Find mismatches between initiatives and people
  const mismatches = useMemo(() => {
    const initiativeUnits = new Set(initiatives.map(i => i.unit));
    const initiativeTeams = new Set(initiatives.map(i => i.team));
    
    const peopleUnits = new Map<string, number>();
    const peopleTeams = new Map<string, number>();
    
    people.forEach(p => {
      if (p.unit) {
        peopleUnits.set(p.unit, (peopleUnits.get(p.unit) || 0) + 1);
      }
      if (p.team) {
        peopleTeams.set(p.team, (peopleTeams.get(p.team) || 0) + 1);
      }
    });

    const result: Mismatch[] = [];

    // Check for people units not in initiatives
    peopleUnits.forEach((count, unit) => {
      if (!initiativeUnits.has(unit)) {
        result.push({
          type: 'unit',
          initiativeValue: '',
          peopleValue: unit,
          peopleCount: count,
        });
      }
    });

    // Check for people teams not in initiatives
    peopleTeams.forEach((count, team) => {
      if (!initiativeTeams.has(team)) {
        result.push({
          type: 'team',
          initiativeValue: '',
          peopleValue: team,
          peopleCount: count,
        });
      }
    });

    return result;
  }, [people, initiatives]);

  // Available targets for mapping
  const initiativeUnits = useMemo(() => 
    [...new Set(initiatives.map(i => i.unit))].sort(), 
    [initiatives]
  );
  
  const initiativeTeams = useMemo(() => 
    [...new Set(initiatives.map(i => i.team))].sort(), 
    [initiatives]
  );

  const [mappings, setMappings] = useState<Record<string, string>>({});

  const handleApply = async (mismatch: Mismatch) => {
    const target = mappings[`${mismatch.type}-${mismatch.peopleValue}`];
    if (!target) {
      toast({
        title: 'Выберите значение для замены',
        variant: 'destructive',
      });
      return;
    }

    setApplying(`${mismatch.type}-${mismatch.peopleValue}`);
    
    try {
      if (mismatch.type === 'unit') {
        await bulkUpdateUnit.mutateAsync({ 
          fromValue: mismatch.peopleValue, 
          toValue: target 
        });
      } else {
        await bulkUpdateTeam.mutateAsync({ 
          fromValue: mismatch.peopleValue, 
          toValue: target 
        });
      }
      toast({
        title: 'Данные обновлены',
        description: `${mismatch.peopleCount} сотрудников обновлено`,
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setApplying(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>🔄 Синонимы Unit/Team</DialogTitle>
          <DialogDescription>
            Здесь отображаются значения Unit/Team в таблице сотрудников, которые не совпадают с инициативами.
            Выберите, на что заменить, и нажмите "Применить".
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          {mismatches.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Check className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p>Все Unit и Team совпадают!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mismatches.map((mismatch) => {
                const key = `${mismatch.type}-${mismatch.peopleValue}`;
                const isApplying = applying === key;
                const options = mismatch.type === 'unit' ? initiativeUnits : initiativeTeams;
                
                return (
                  <div 
                    key={key}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <Badge variant={mismatch.type === 'unit' ? 'default' : 'secondary'}>
                      {mismatch.type === 'unit' ? 'Unit' : 'Team'}
                    </Badge>
                    
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-medium">{mismatch.peopleValue}</span>
                      <Badge variant="outline">{mismatch.peopleCount} чел.</Badge>
                    </div>
                    
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    
                    <Select 
                      value={mappings[key] || ''} 
                      onValueChange={(v) => setMappings(prev => ({ ...prev, [key]: v }))}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Заменить на..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Button 
                      size="sm" 
                      onClick={() => handleApply(mismatch)}
                      disabled={!mappings[key] || isApplying}
                    >
                      {isApplying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Применить'
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
