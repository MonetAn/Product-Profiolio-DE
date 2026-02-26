import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Person, VirtualAssignment } from '@/lib/peopleDataManager';
import { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import EffortInput from './EffortInput';
import { cn } from '@/lib/utils';

interface InitiativeGroupRowProps {
  initiative: AdminDataRow;
  assignments: VirtualAssignment[];
  people: Person[];
  quarters: string[];
  gridCols: string;
  onEffortChange: (assignment: VirtualAssignment, quarter: string, value: number) => void;
}

export default function InitiativeGroupRow({
  initiative,
  assignments,
  people,
  quarters,
  gridCols,
  onEffortChange
}: InitiativeGroupRowProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Calculate totals per quarter for this initiative (sum of all people)
  const quarterTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    quarters.forEach(q => {
      totals[q] = assignments.reduce((sum, a) => sum + (a.quarterly_effort[q] || 0), 0);
    });
    return totals;
  }, [assignments, quarters]);

  // Get expected effort from initiative's effortCoefficient
  const expectedEffort = useMemo(() => {
    const expected: Record<string, number> = {};
    quarters.forEach(q => {
      const qData = initiative.quarterlyData[q] as AdminQuarterData | undefined;
      expected[q] = qData?.effortCoefficient || 0;
    });
    return expected;
  }, [initiative, quarters]);

  // Get person info for assignments
  const assignmentDetails = useMemo(() => {
    return assignments.map(a => ({
      assignment: a,
      person: people.find(p => p.id === a.person_id)
    })).filter(d => d.person); // Only show assignments with valid people
  }, [assignments, people]);

  if (assignmentDetails.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b">
      <CollapsibleTrigger asChild>
        <div 
          className="grid items-center px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          style={{ gridTemplateColumns: gridCols }}
        >
          {/* Initiative info */}
          <div className="flex items-center gap-3 min-w-0">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            
            <div className="min-w-0">
              <div className="font-medium truncate" title={initiative.initiative}>
                {initiative.initiative}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {[initiative.team, initiative.initiativeType].filter(Boolean).join(' • ')}
              </div>
            </div>
          </div>

          {/* Quarter totals vs expected - each in its own grid cell */}
          {quarters.map(q => {
            const total = quarterTotals[q] || 0;
            const expected = expectedEffort[q] || 0;
            
            return (
              <div 
                key={q} 
                className={cn(
                  "text-xs font-mono px-2 py-1 rounded text-center",
                  total === 0 && "bg-muted text-muted-foreground",
                  total > 0 && "bg-primary/10 text-primary"
                )}
                title={`${q}: ${total}% (ожидаемый effort: ${expected}%)`}
              >
                {total}%
                {expected > 0 && (
                  <span className="text-muted-foreground ml-1">
                    /{expected}%
                  </span>
                )}
              </div>
            );
          })}

          <Badge variant="outline" className="justify-self-end">
            {assignmentDetails.length} чел.
          </Badge>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="bg-muted/20 border-t">
          {assignmentDetails.map(({ assignment, person }) => (
            <div 
              key={assignment.id || `${assignment.person_id}-${assignment.initiative_id}`}
              className="grid items-center px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-muted/30"
              style={{ gridTemplateColumns: gridCols }}
            >
              {/* Person info - indented */}
              <div className="min-w-0 pl-7">
                <div className="font-medium truncate">
                  {person!.full_name}
                  {person!.terminated_at && (
                    <Badge variant="secondary" className="ml-2 text-xs">Уволен</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {person!.position || person!.team || '—'}
                </div>
              </div>

              {/* Quarter efforts - each in its own grid cell */}
              {quarters.map(q => (
                <div key={q} className="flex justify-center">
                  <EffortInput
                    value={assignment.quarterly_effort[q] || 0}
                    expectedValue={assignment.expected_effort?.[q]}
                    isAuto={assignment.is_auto}
                    isVirtual={assignment.isVirtual}
                    onChange={(value) => onEffortChange(assignment, q, value)}
                  />
                </div>
              ))}

              {/* Empty cell for badge column alignment */}
              <div />
            </div>
          ))}

          {/* Totals row */}
          <div 
            className="grid items-center px-4 py-2 bg-muted/40 font-medium text-sm"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="pl-7">Итого:</div>
            
            {quarters.map(q => {
              const total = quarterTotals[q] || 0;
              const expected = expectedEffort[q] || 0;
              const isMatch = expected > 0 && total === expected;
              const isMismatch = expected > 0 && total !== expected;
              
              return (
                <div 
                  key={q} 
                  className={cn(
                    "text-xs font-mono px-2 py-1 rounded text-center",
                    isMatch && "bg-primary/20 text-primary",
                    isMismatch && "bg-accent text-accent-foreground",
                    !expected && "text-muted-foreground"
                  )}
                >
                  {total}%
                  {isMatch && <CheckCircle2 className="inline h-3 w-3 ml-1" />}
                  {isMismatch && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                </div>
              );
            })}

            <div />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
