import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { usePeopleMutations } from '@/hooks/usePeople';
import { parseHRStructure } from '@/lib/peopleDataManager';

interface PersonCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Подставляются из выбранного скоупа на странице «Люди», если есть */
  defaultUnit?: string;
  defaultTeam?: string;
}

const emptyForm = {
  full_name: '',
  email: '',
  hr_structure: '',
  unit: '',
  team: '',
  position: '',
  leader: '',
  hired_at: '',
  terminated_at: '',
};

export default function PersonCreateDialog({
  open,
  onOpenChange,
  defaultUnit = '',
  defaultTeam = '',
}: PersonCreateDialogProps) {
  const { createPerson } = usePeopleMutations();
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setFormData({
      ...emptyForm,
      unit: defaultUnit,
      team: defaultTeam,
    });
  }, [open, defaultUnit, defaultTeam]);

  const applyHrStructure = () => {
    const { unit, team } = parseHRStructure(formData.hr_structure);
    setFormData((prev) => ({
      ...prev,
      unit: unit || prev.unit,
      team: team || prev.team,
    }));
  };

  const handleSave = async () => {
    const name = formData.full_name.trim();
    if (!name) return;

    await createPerson.mutateAsync({
      external_id: `manual:${crypto.randomUUID()}`,
      full_name: name,
      email: formData.email.trim() || null,
      hr_structure: formData.hr_structure.trim() || null,
      unit: formData.unit.trim() || null,
      team: formData.team.trim() || null,
      position: formData.position.trim() || null,
      leader: formData.leader.trim() || null,
      hired_at: formData.hired_at.trim() || null,
      terminated_at: formData.terminated_at.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Добавить сотрудника</DialogTitle>
          <DialogDescription>
            Запись попадёт в справочник людей; при необходимости привязки к квартальному составу команды
            настройте снимки команды отдельно.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create_full_name">ФИО *</Label>
            <Input
              id="create_full_name"
              value={formData.full_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
              placeholder="Иванов Иван"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="create_hr_structure">HR-структура</Label>
                <Input
                  id="create_hr_structure"
                  value={formData.hr_structure}
                  onChange={(e) => setFormData((prev) => ({ ...prev, hr_structure: e.target.value }))}
                  placeholder="Dodo Engineering.Unit.Team"
                />
              </div>
              <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={applyHrStructure}>
                → Unit/Team
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Как в выгрузке: после ввода нажмите «→ Unit/Team», либо укажите Unit и Team вручную ниже.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="create_unit">Unit</Label>
              <Input
                id="create_unit"
                value={formData.unit}
                onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create_team">Team</Label>
              <Input
                id="create_team"
                value={formData.team}
                onChange={(e) => setFormData((prev) => ({ ...prev, team: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create_email">Email</Label>
            <Input
              id="create_email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create_position">Должность</Label>
            <Input
              id="create_position"
              value={formData.position}
              onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create_leader">Лидер</Label>
            <Input
              id="create_leader"
              value={formData.leader}
              onChange={(e) => setFormData((prev) => ({ ...prev, leader: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="create_hired_at">Дата приёма</Label>
              <Input
                id="create_hired_at"
                type="date"
                value={formData.hired_at}
                onChange={(e) => setFormData((prev) => ({ ...prev, hired_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create_terminated_at">Дата увольнения</Label>
              <Input
                id="create_terminated_at"
                type="date"
                value={formData.terminated_at}
                onChange={(e) => setFormData((prev) => ({ ...prev, terminated_at: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={createPerson.isPending || !formData.full_name.trim()}
          >
            {createPerson.isPending ? 'Сохранение…' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
