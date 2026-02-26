import { useMemo } from 'react';
import { Download, ArrowRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SnapshotStatus } from '@/hooks/useTeamSnapshots';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface QuarterSelectorProps {
  quarters: string[];
  selectedQuarter: string | 'all';
  onQuarterChange: (quarter: string | 'all') => void;
  snapshotStatuses?: Map<string, SnapshotStatus>;
}

export default function QuarterSelector({
  quarters,
  selectedQuarter,
  onQuarterChange,
  snapshotStatuses
}: QuarterSelectorProps) {
  // Format quarter for display: "2025-Q1" → "25 Q1"
  const formatQuarter = (q: string) => q.replace('20', '').replace('-', ' ');

  const getStatusIcon = (status?: SnapshotStatus) => {
    if (!status) return null;
    
    switch (status.type) {
      case 'snapshot':
        return <Download className="h-3 w-3" />;
      case 'carried_forward':
        return <ArrowRight className="h-3 w-3" />;
      case 'current_staff':
        return <Users className="h-3 w-3" />;
    }
  };

  const getStatusTooltip = (quarter: string, status?: SnapshotStatus) => {
    if (!status) return null;
    
    switch (status.type) {
      case 'snapshot':
        return `Снимок загружен${status.importedAt ? ` ${new Date(status.importedAt).toLocaleDateString('ru')}` : ''}`;
      case 'carried_forward':
        return `Протянуто из ${status.sourceQuarter?.replace('20', '').replace('-', ' ')}`;
      case 'current_staff':
        return 'Текущий состав команды';
    }
  };

  const getStatusColor = (status?: SnapshotStatus) => {
    if (!status) return '';
    
    switch (status.type) {
      case 'snapshot':
        return 'text-primary';
      case 'carried_forward':
        return 'text-muted-foreground';
      case 'current_staff':
        return 'text-muted-foreground';
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
        {/* Individual quarters */}
        {quarters.map(quarter => {
          const status = snapshotStatuses?.get(quarter);
          const isSelected = selectedQuarter === quarter;
          
          return (
            <Tooltip key={quarter}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onQuarterChange(quarter)}
                  className={cn(
                    "relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    "hover:bg-background/80",
                    isSelected 
                      ? "bg-background shadow-sm text-foreground" 
                      : "text-muted-foreground"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {formatQuarter(quarter)}
                    {status && (
                      <span className={cn("opacity-70", getStatusColor(status))}>
                        {getStatusIcon(status)}
                      </span>
                    )}
                  </span>
                </button>
              </TooltipTrigger>
              {status && (
                <TooltipContent side="bottom" className="text-xs">
                  {getStatusTooltip(quarter, status)}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}

        {/* Divider */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* "All" option */}
        <button
          onClick={() => onQuarterChange('all')}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            "hover:bg-background/80",
            selectedQuarter === 'all' 
              ? "bg-background shadow-sm text-foreground" 
              : "text-muted-foreground"
          )}
        >
          Все
        </button>
      </div>
    </TooltipProvider>
  );
}
