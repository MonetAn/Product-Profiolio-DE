import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { usePeopleMutations } from '@/hooks/usePeople';
import { Person } from '@/lib/peopleDataManager';

interface PersonEditDialogProps {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PersonEditDialog({ person, open, onOpenChange }: PersonEditDialogProps) {
  const { updatePerson } = usePeopleMutations();
  
  const [formData, setFormData] = useState({
    full_name: person.full_name,
    email: person.email || '',
    hr_structure: person.hr_structure || '',
    unit: person.unit || '',
    team: person.team || '',
    position: person.position || '',
  });

  // Reset form when person changes
  useEffect(() => {
    setFormData({
      full_name: person.full_name,
      email: person.email || '',
      hr_structure: person.hr_structure || '',
      unit: person.unit || '',
      team: person.team || '',
      position: person.position || '',
    });
  }, [person]);

  const handleSave = async () => {
    await updatePerson.mutateAsync({
      id: person.id,
      full_name: formData.full_name,
      email: formData.email || null,
      hr_structure: formData.hr_structure || null,
      unit: formData.unit || null,
      team: formData.team || null,
      position: formData.position || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Редактирование сотрудника</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">ФИО</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hr_structure">HR-структура</Label>
            <Input
              id="hr_structure"
              value={formData.hr_structure}
              onChange={(e) => setFormData(prev => ({ ...prev, hr_structure: e.target.value }))}
              placeholder="Dodo Engineering.Unit.Team"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team">Team</Label>
              <Input
                id="team"
                value={formData.team}
                onChange={(e) => setFormData(prev => ({ ...prev, team: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="position">Должность</Label>
            <Input
              id="position"
              value={formData.position}
              onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={updatePerson.isPending}>
            💾 Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
