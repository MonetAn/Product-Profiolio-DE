import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Building2, Users, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTeamsForUnits } from '@/lib/adminDataManager';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { cn } from '@/lib/utils';

type Props = {
  units: string[];
  rawData: AdminDataRow[];
  memberUnit: string | null;
  memberTeam: string | null;
  onBack: () => void;
  onStart: (unit: string, teamsInOrder: string[]) => void;
};

export function AdminQuickFlowSetupScreen({
  units,
  rawData,
  memberUnit,
  memberTeam,
  onBack,
  onStart,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [unitChoice, setUnitChoice] = useState<string>(() => memberUnit?.trim() || '');
  const [showUnitPicker, setShowUnitPicker] = useState(!memberUnit?.trim());
  const [teamOrder, setTeamOrder] = useState<string[]>([]);

  const teamsForUnit = useMemo(
    () => (unitChoice ? getTeamsForUnits(rawData, [unitChoice]) : []),
    [rawData, unitChoice]
  );

  const selectedSet = useMemo(() => new Set(teamOrder), [teamOrder]);

  const goToStep2 = useCallback(() => {
    if (!unitChoice) return;
    const tfu = getTeamsForUnits(rawData, [unitChoice]);
    const mt = memberTeam?.trim();
    if (mt && tfu.includes(mt)) setTeamOrder([mt]);
    else setTeamOrder([]);
    setStep(2);
  }, [unitChoice, memberTeam, rawData]);

  const toggleTeam = useCallback((t: string) => {
    setTeamOrder((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }, []);

  const handleConfirmUnitFromProfile = useCallback(() => {
    const u = memberUnit?.trim();
    if (!u) return;
    setUnitChoice(u);
    setShowUnitPicker(false);
    const tfu = getTeamsForUnits(rawData, [u]);
    const mt = memberTeam?.trim();
    if (mt && tfu.includes(mt)) setTeamOrder([mt]);
    else setTeamOrder([]);
    setStep(2);
  }, [memberUnit, memberTeam, rawData]);

  const handleNextFromUnitStep = useCallback(() => {
    if (showUnitPicker && unitChoice) goToStep2();
  }, [showUnitPicker, unitChoice, goToStep2]);

  const canStart = teamOrder.length > 0;

  return (
    <div className="min-h-0 flex-1 flex flex-col bg-gradient-to-b from-muted/40 via-background to-background overflow-auto">
      <div className="w-full max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8">
        <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5 -ml-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>

        <header className="space-y-2 text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Заполнение по шагам</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">Настроим контекст</h1>
          <p className="text-sm text-muted-foreground text-balance max-w-md mx-auto sm:mx-0">
            Юнит и команды. По каждой команде — два шага: коэффициенты и проверка полей.
          </p>
        </header>

        <div className="flex items-center justify-center sm:justify-start gap-2">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
              step === 1 ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
            )}
          >
            1
          </span>
          <div className="h-px w-8 bg-border" />
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
              step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            2
          </span>
        </div>

        {step === 1 && (
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Юнит</CardTitle>
              </div>
              <CardDescription>Инициативы и проценты — в рамках одного юнита за проход.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {memberUnit?.trim() && !showUnitPicker ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Ваш юнит в профиле</p>
                      <p className="text-lg font-semibold mt-1">{memberUnit.trim()}</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button className="flex-1" onClick={handleConfirmUnitFromProfile}>
                      Да, это мой юнит
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setShowUnitPicker(true); setUnitChoice(''); }}>
                      Выбрать другой
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Выберите юнит</Label>
                  <Select value={unitChoice || undefined} onValueChange={setUnitChoice}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Юнит…" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {memberUnit?.trim() && showUnitPicker && (
                    <Button
                      type="button"
                      variant="link"
                      className="px-0 h-auto text-muted-foreground"
                      onClick={() => { setShowUnitPicker(false); setUnitChoice(''); }}
                    >
                      Вернуться к юниту из профиля
                    </Button>
                  )}
                  <Button className="w-full sm:w-auto mt-2" disabled={!unitChoice} onClick={handleNextFromUnitStep}>
                    Далее: команды
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Команды</CardTitle>
              </div>
              <CardDescription>
                {memberTeam?.trim() && teamsForUnit.includes(memberTeam.trim())
                  ? 'Ваша команда отмечена. Добавьте ещё при необходимости.'
                  : 'Выберите одну или несколько. Порядок отметок = порядок прохождения.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Юнит: <span className="font-medium text-foreground">{unitChoice}</span>
              </p>
              {teamsForUnit.length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg p-3">
                  Нет команд в данных. Создайте инициативы в полной таблице.
                </p>
              ) : (
                <div className="rounded-lg border border-border max-h-[min(50vh,320px)] overflow-y-auto divide-y divide-border">
                  {teamsForUnit.map((t) => (
                    <label
                      key={t || '_empty'}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox checked={selectedSet.has(t)} onCheckedChange={() => toggleTeam(t)} />
                      <span className="text-sm font-medium">{t || '—'}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Изменить юнит
                </Button>
                <Button
                  className="sm:ml-auto"
                  disabled={!canStart}
                  onClick={() => onStart(unitChoice, teamOrder)}
                >
                  Начать заполнение
                  {teamOrder.length > 1 && (
                    <span className="ml-1.5 text-xs opacity-90">({teamOrder.length})</span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
