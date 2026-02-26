import { useState, useMemo } from 'react';
import { Plus, Trash2, Calendar, Mail, Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Person } from '@/lib/peopleDataManager';
import { AdminDataRow } from '@/lib/adminDataManager';
import { usePersonAssignmentsByPerson, useAssignmentMutations } from '@/hooks/usePeopleAssignments';

interface PersonDetailDialogProps {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initiatives: AdminDataRow[];
  quarters: string[];
}

export default function PersonDetailDialog({
  person,
  open,
  onOpenChange,
  initiatives,
  quarters,
}: PersonDetailDialogProps) {
  const { data: assignments, isLoading } = usePersonAssignmentsByPerson(person.id);
  const { createAssignment, updateAssignment, deleteAssignment } = useAssignmentMutations();
  
  const [newInitiativeId, setNewInitiativeId] = useState<string>('');

  // Get initiatives this person is NOT already assigned to
  const availableInitiatives = useMemo(() => {
    if (!assignments) return initiatives;
    const assignedIds = new Set(assignments.map(a => a.initiative_id));
    return initiatives.filter(i => !assignedIds.has(i.id));
  }, [initiatives, assignments]);

  // Calculate totals per quarter
  const quarterTotals = useMemo(() => {
    if (!assignments) return {};
    const totals: Record<string, number> = {};
    quarters.forEach(q => {
      totals[q] = assignments.reduce((sum, a) => sum + (a.quarterly_effort[q] || 0), 0);
    });
    return totals;
  }, [assignments, quarters]);

  const handleAddAssignment = async () => {
    if (!newInitiativeId) return;
    
    await createAssignment.mutateAsync({
      person_id: person.id,
      initiative_id: newInitiativeId,
      quarterly_effort: {},
      is_auto: false // Manual addition
    });
    
    setNewInitiativeId('');
  };

  const handleEffortChange = async (assignmentId: string, quarter: string, value: number) => {
    const assignment = assignments?.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    await updateAssignment.mutateAsync({
      id: assignmentId,
      quarterly_effort: {
        ...assignment.quarterly_effort,
        [quarter]: value
      },
      is_auto: false // Manual edit marks as not auto
    });
  };

  const displayQuarters = quarters.slice(-4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">{person.full_name}</DialogTitle>
        </DialogHeader>

        {/* Person Info */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Unit:</span>
            <span>{person.unit || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Команда:</span>
            <span>{person.team || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{person.email || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Работает:</span>
            <span>
              {person.hired_at || '?'} — {person.terminated_at || 'настоящее время'}
            </span>
          </div>
        </div>

        {/* Quarter totals */}
        <div className="flex items-center gap-4 px-2">
          <span className="text-sm font-medium">Сумма усилий:</span>
          {displayQuarters.map(q => {
            const total = quarterTotals[q] || 0;
            const isOver = total > 100;
            return (
              <Badge
                key={q}
                variant={isOver ? 'destructive' : total > 0 ? 'default' : 'secondary'}
                className="font-mono"
              >
                {q.replace('20', '').replace('-', ' ')}: {total}%
              </Badge>
            );
          })}
        </div>

        {/* Assignments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-base">Привязки к инициативам</Label>
            <div className="flex items-center gap-2">
              <Select value={newInitiativeId} onValueChange={setNewInitiativeId}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Выбрать инициативу..." />
                </SelectTrigger>
                <SelectContent>
                  {availableInitiatives.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.team} / {i.initiative}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleAddAssignment}
                disabled={!newInitiativeId || createAssignment.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[250px] border rounded-lg">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
            ) : assignments?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Нет привязок к инициативам
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left p-2 w-[200px]">Инициатива</th>
                    {displayQuarters.map(q => (
                      <th key={q} className="text-center p-2 w-[100px]">
                        {q.replace('20', '').replace('-', ' ')}
                      </th>
                    ))}
                    <th className="w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments?.map(assignment => {
                    const initiative = initiatives.find(i => i.id === assignment.initiative_id);
                    return (
                      <tr key={assignment.id} className="border-t">
                        <td className="p-2">
                          <div className="font-medium truncate">
                            {initiative?.initiative || 'Неизвестная инициатива'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {initiative?.team}
                          </div>
                        </td>
                        {displayQuarters.map(q => (
                          <td key={q} className="p-2">
                            <div className="flex items-center gap-2">
                              <Slider
                                value={[assignment.quarterly_effort[q] || 0]}
                                onValueChange={([v]) => handleEffortChange(assignment.id, q, v)}
                                max={100}
                                step={5}
                                className="w-16"
                              />
                              <Input
                                type="number"
                                value={assignment.quarterly_effort[q] || 0}
                                onChange={(e) => handleEffortChange(assignment.id, q, parseInt(e.target.value) || 0)}
                                className="w-14 h-7 text-center text-xs"
                                min={0}
                                max={100}
                              />
                            </div>
                          </td>
                        ))}
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteAssignment.mutate(assignment.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
