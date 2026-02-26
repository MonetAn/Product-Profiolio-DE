import { useState } from 'react';
import { Plus, ExternalLink, Pencil, Eye, EyeOff, AlertCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { Badge } from '@/components/ui/badge';
import QuarterCell from './QuarterCell';
import InitiativeDetailDialog from './InitiativeDetailDialog';
import { AdminDataRow, AdminQuarterData, INITIATIVE_TYPES, validateTeamQuarterEffort, getTeamQuarterEffortSums, getInheritedSupportInfo } from '@/lib/adminDataManager';

interface InitiativeTableProps {
  data: AdminDataRow[];
  allData: AdminDataRow[]; // Full dataset for effort validation
  quarters: string[];
  selectedUnits: string[];
  selectedTeams: string[];
  onDataChange: (id: string, field: keyof AdminDataRow, value: string | string[] | number) => void;
  onQuarterDataChange: (id: string, quarter: string, field: keyof AdminQuarterData, value: string | number | boolean) => void;
  onAddInitiative: () => void;
  onDeleteInitiative: (id: string) => Promise<void>;
  modifiedIds: Set<string>;
  hideUnitTeamColumns?: boolean;
}

// Get list of missing required fields for initiative (shortened names for compact display)
const getMissingInitiativeFields = (row: AdminDataRow): string[] => {
  const missing: string[] = [];
  if (!row.initiativeType) missing.push('Тип');
  if (!row.stakeholdersList || row.stakeholdersList.length === 0) missing.push('Стейкх.');
  if (!row.description) missing.push('Описание');
  return missing;
};

// Check if initiative has incomplete required fields
const isInitiativeIncomplete = (row: AdminDataRow): boolean => {
  return getMissingInitiativeFields(row).length > 0;
};

// Check if quarter has incomplete required fields
const isQuarterIncomplete = (data: AdminQuarterData): boolean => {
  return !data.metricPlan || !data.metricFact;
};

const InitiativeTable = ({
  data,
  allData,
  quarters,
  selectedUnits,
  selectedTeams,
  onDataChange,
  onQuarterDataChange,
  onAddInitiative,
  onDeleteInitiative,
  modifiedIds,
  hideUnitTeamColumns = false
}: InitiativeTableProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedView, setExpandedView] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Find the current initiative from data to ensure we always have fresh data
  const selectedInitiative = selectedId ? data.find(row => row.id === selectedId) || null : null;
  const deleteTargetRow = deleteConfirmId ? data.find(row => row.id === deleteConfirmId) || null : null;

  // Calculate effort sums for each quarter (for filtered data)
  const quarterEffortSums = getTeamQuarterEffortSums(allData, selectedUnits, selectedTeams, quarters);

  const handleRowClick = (row: AdminDataRow) => {
    setSelectedId(row.id);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await onDeleteInitiative(deleteConfirmId);
      setDeleteConfirmId(null);
      if (selectedId === deleteConfirmId) setSelectedId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground mb-4">Нет инициатив для отображения</p>
        <Button onClick={onAddInitiative} className="gap-2">
          <Plus size={16} />
          Добавить инициативу
        </Button>
      </div>
    );
  }

  // Count incomplete initiatives
  const incompleteCount = data.filter(row => 
    isInitiativeIncomplete(row) || 
    quarters.some(q => isQuarterIncomplete(row.quarterlyData[q] || {} as AdminQuarterData))
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={onAddInitiative} size="sm" className="gap-2">
            <Plus size={16} />
            Новая инициатива
          </Button>
          
          {/* Legend for incomplete fields */}
          {incompleteCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
              <AlertCircle size={14} />
              <span>Требуется заполнить ({incompleteCount})</span>
            </div>
          )}
        </div>
        
        {/* Expanded View Toggle */}
        <div className="flex items-center gap-2">
          {expandedView ? <Eye size={16} /> : <EyeOff size={16} />}
          <Label htmlFor="expanded-view" className="text-sm cursor-pointer">
            Развернутый вид
          </Label>
          <Switch
            id="expanded-view"
            checked={expandedView}
            onCheckedChange={setExpandedView}
          />
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[60px] w-[60px]"></TableHead>
                {!hideUnitTeamColumns && (
                  <TableHead className="sticky left-[60px] bg-card z-10 min-w-[90px]">Unit</TableHead>
                )}
                {!hideUnitTeamColumns && (
                  <TableHead className="sticky left-[150px] bg-card z-10 min-w-[100px]">Team</TableHead>
                )}
                <TableHead className={`sticky ${hideUnitTeamColumns ? 'left-[60px]' : 'left-[250px]'} bg-card z-10 min-w-[160px]`}>Initiative</TableHead>
                <TableHead className="min-w-[100px]">Type</TableHead>
                <TableHead className="min-w-[140px]">Stakeholders</TableHead>
                <TableHead className={`${expandedView ? 'min-w-[200px]' : 'min-w-[120px]'}`}>Description</TableHead>
                <TableHead className="min-w-[100px]">Doc</TableHead>
                {quarters.map(q => {
                  const effortSum = quarterEffortSums[q];
                  return (
                    <TableHead key={q} className="min-w-[220px]">
                      <div className="flex flex-col gap-0.5">
                        <span>{q}</span>
                        {/* Effort sum indicator */}
                        <span className={`text-[10px] font-normal ${
                          effortSum.total === 0 ? 'text-muted-foreground' :
                          !effortSum.isValid ? 'text-red-600' : 
                          effortSum.total < 80 ? 'text-muted-foreground' : 
                          'text-green-600'
                        }`}>
                          {effortSum.total}%
                          {!effortSum.isValid && ' ⚠'}
                          {effortSum.isValid && effortSum.total >= 80 && ' ✓'}
                        </span>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const initiativeIncomplete = isInitiativeIncomplete(row);
                const hasIncompleteQuarters = quarters.some(q => 
                  isQuarterIncomplete(row.quarterlyData[q] || {} as AdminQuarterData)
                );
                const rowIncomplete = initiativeIncomplete || hasIncompleteQuarters;
                
                return (
                <TableRow 
                  key={row.id} 
                  className={`group ${row.isNew ? 'bg-primary/5' : ''} ${rowIncomplete ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''} hover:bg-muted/50 cursor-pointer`}
                >
                  {/* Row action buttons: edit + delete */}
                  <TableCell 
                    className="sticky left-0 bg-card z-10 p-2"
                    onClick={() => handleRowClick(row)}
                  >
                    <div className="flex items-center gap-1">
                      <Pencil size={14} className="opacity-0 group-hover:opacity-100 text-muted-foreground group-hover:text-primary transition-all flex-shrink-0 cursor-pointer" />
                      <button
                        onClick={(e) => handleDeleteClick(e, row.id)}
                        className="opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 text-muted-foreground hover:text-destructive p-0.5 rounded"
                        title="Удалить инициативу"
                      >
                        <Trash2 size={13} />
                      </button>
                      {initiativeIncomplete && (
                        <div className="flex items-center gap-0.5 text-amber-600 dark:text-amber-500">
                          <AlertTriangle size={12} className="flex-shrink-0" />
                          <span className="text-xs font-medium">{getMissingInitiativeFields(row).length}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Unit - clickable link style */}
                  {!hideUnitTeamColumns && (
                    <TableCell 
                      className="sticky left-[60px] bg-card z-10 p-2 cursor-pointer"
                      onClick={() => handleRowClick(row)}
                    >
                      <span className="text-xs text-primary hover:underline">{row.unit}</span>
                    </TableCell>
                  )}

                  {/* Team - clickable link style */}
                  {!hideUnitTeamColumns && (
                    <TableCell 
                      className="sticky left-[150px] bg-card z-10 p-2 cursor-pointer"
                      onClick={() => handleRowClick(row)}
                    >
                      <span className="text-xs text-primary hover:underline">{row.team || '—'}</span>
                    </TableCell>
                  )}

                  {/* Initiative - clickable link style */}
                  <TableCell 
                    className={`sticky ${hideUnitTeamColumns ? 'left-[60px]' : 'left-[250px]'} bg-card z-10 p-2 cursor-pointer`}
                    onClick={() => handleRowClick(row)}
                  >
                    <span className="text-xs text-primary hover:underline truncate block max-w-[150px]">
                      {row.initiative || <span className="text-muted-foreground italic">—</span>}
                    </span>
                  </TableCell>

                  {/* Type - clickable with tooltip */}
                  <TableCell 
                    className="p-2 cursor-pointer"
                    onClick={() => handleRowClick(row)}
                  >
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-primary hover:underline">
                            {row.initiativeType ? INITIATIVE_TYPES.find(t => t.value === row.initiativeType)?.label : '—'}
                          </span>
                        </TooltipTrigger>
                        {row.initiativeType && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{INITIATIVE_TYPES.find(t => t.value === row.initiativeType)?.description}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Stakeholders - clickable badges */}
                  <TableCell 
                    className="p-2 cursor-pointer"
                    onClick={() => handleRowClick(row)}
                  >
                    <div className="flex flex-wrap gap-0.5 max-w-[130px]">
                      {row.stakeholdersList && row.stakeholdersList.length > 0 ? (
                        <>
                          {row.stakeholdersList.slice(0, 2).map(s => (
                            <Badge key={s} variant="secondary" className="text-[10px] px-1 py-0">
                              {s.length > 6 ? s.slice(0, 6) + '…' : s}
                            </Badge>
                          ))}
                          {row.stakeholdersList.length > 2 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              +{row.stakeholdersList.length - 2}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-primary hover:underline">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Description - very truncated, click to see full */}
                  <TableCell 
                    onClick={() => handleRowClick(row)}
                    className="p-2 cursor-pointer"
                  >
                    <span className="block text-xs text-primary hover:underline truncate max-w-[100px]">
                      {row.description ? row.description.slice(0, 30) + (row.description.length > 30 ? '…' : '') : '—'}
                    </span>
                  </TableCell>

                  {/* Doc Link - clickable */}
                  <TableCell 
                    className="p-2 cursor-pointer"
                    onClick={() => handleRowClick(row)}
                  >
                    {row.documentationLink ? (
                      <a 
                        href={row.documentationLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={12} />
                        Ссылка
                      </a>
                    ) : (
                      <span className="text-xs text-primary hover:underline">—</span>
                    )}
                  </TableCell>

                  {/* Quarter cells */}
                  {quarters.map(q => {
                    const teamEffort = validateTeamQuarterEffort(allData, row.unit, row.team, q);
                    const supportInfo = getInheritedSupportInfo(row.quarterlyData, q, quarters);
                    
                    // Handle cascading support change
                    const handleSupportChange = (value: boolean) => {
                      if (value) {
                        // Enable support for this and all subsequent quarters
                        const quarterIndex = quarters.indexOf(q);
                        for (let i = quarterIndex; i < quarters.length; i++) {
                          onQuarterDataChange(row.id, quarters[i], 'support', true);
                        }
                      } else {
                        // Disable support - also disable for all subsequent quarters
                        const quarterIndex = quarters.indexOf(q);
                        for (let i = quarterIndex; i < quarters.length; i++) {
                          onQuarterDataChange(row.id, quarters[i], 'support', false);
                        }
                      }
                    };
                    
                    return (
                      <TableCell key={q} className="p-2" onClick={(e) => e.stopPropagation()}>
                        <QuarterCell
                          quarter={q}
                          data={row.quarterlyData[q] || {
                            cost: 0,
                            otherCosts: 0,
                            support: false,
                            onTrack: true,
                            metricPlan: '',
                            metricFact: '',
                            comment: '',
                            effortCoefficient: 0
                          }}
                          onChange={(field, value) => onQuarterDataChange(row.id, q, field, value)}
                          isModified={modifiedIds.has(row.id)}
                          expandedView={expandedView}
                          teamEffort={teamEffort}
                          isExpanded={expandedRowIds.has(row.id)}
                          onToggleExpand={() => toggleRowExpanded(row.id)}
                          isInheritedSupport={supportInfo.isInherited}
                          inheritedFromQuarter={supportInfo.fromQuarter || undefined}
                          onSupportChange={handleSupportChange}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Initiative Detail Dialog */}
      <InitiativeDetailDialog
        initiative={selectedInitiative}
        allData={allData}
        quarters={quarters}
        open={!!selectedInitiative}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onDataChange={onDataChange}
        onQuarterDataChange={onQuarterDataChange}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить инициативу?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы удаляете инициативу{' '}
              <span className="font-semibold text-foreground">
                «{deleteTargetRow?.initiative}»
              </span>
              {deleteTargetRow && ` (${deleteTargetRow.unit} / ${deleteTargetRow.team})`}.
              <br />
              Это действие необратимо — данные будут удалены из базы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InitiativeTable;
