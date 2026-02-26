import { ArrowLeft, FileSpreadsheet, Check, Loader2, AlertCircle, RefreshCw, Users, ClipboardList } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SyncStatus } from '@/hooks/useInitiativeMutations';
import UnifiedSettingsMenu from './UnifiedSettingsMenu';

type ViewMode = 'initiatives' | 'people';

interface AdminHeaderProps {
  currentView: ViewMode;
  initiativeCount?: number;
  totalInitiativeCount?: number;
  peopleCount?: number;
  hasData?: boolean;
  hasFilters?: boolean;
  syncStatus?: SyncStatus;
  pendingChanges?: number;
  onImportClick?: () => void;
  onDownloadAll?: () => void;
  onDownloadFiltered?: () => void;
  onRetry?: () => void;
  onImportPeople?: () => void;
}

const AdminHeader = ({
  currentView,
  initiativeCount = 0,
  totalInitiativeCount = 0,
  peopleCount = 0,
  hasData = false,
  hasFilters = false,
  syncStatus = 'synced',
  pendingChanges = 0,
  onImportClick,
  onDownloadAll,
  onDownloadFiltered,
  onRetry,
  onImportPeople
}: AdminHeaderProps) => {
  const [searchParams] = useSearchParams();
  
  // Build URLs preserving current filters
  const initiativesUrl = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `/admin?${queryString}` : '/admin';
  }, [searchParams]);
  
  const peopleUrl = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `/admin/people?${queryString}` : '/admin/people';
  }, [searchParams]);

  // Sync status indicator
  const renderSyncStatus = () => {
    switch (syncStatus) {
      case 'saving':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Сохранение...</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {pendingChanges > 0 ? `${pendingChanges} изменений в очереди` : 'Сохранение изменений'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'synced':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                  <Check size={12} />
                  <span>Сохранено</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Все изменения сохранены</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'error':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                >
                  <AlertCircle size={12} />
                  <span>Ошибка</span>
                  <RefreshCw size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Нажмите для повторной попытки</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'offline':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-medium">
            <AlertCircle size={12} />
            <span>Офлайн</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-6 shrink-0">
      {/* Back to Dashboard */}
      <Link to="/">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Дашборд</span>
        </Button>
      </Link>

      {/* Logo & Title */}
      <div className="flex items-center gap-2 font-semibold text-foreground ml-4">
        <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center text-primary-foreground text-sm font-bold">
          A
        </div>
        <span>Управление</span>
      </div>

      {/* Navigation Toggle */}
      <div className="ml-6">
        <ToggleGroup 
          type="single" 
          value={currentView} 
          className="bg-secondary rounded-lg p-1"
        >
          <Link to={initiativesUrl}>
            <ToggleGroupItem 
              value="initiatives" 
              className="gap-1.5 px-3 h-8 text-sm font-medium rounded-md transition-all data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Инициативы</span>
            </ToggleGroupItem>
          </Link>
          <Link to={peopleUrl}>
            <ToggleGroupItem 
              value="people" 
              className="gap-1.5 px-3 h-8 text-sm font-medium rounded-md transition-all data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Люди</span>
            </ToggleGroupItem>
          </Link>
        </ToggleGroup>
      </div>

      {/* Stats */}
      {hasData && (
        <div className="ml-4 flex items-center gap-3 text-sm text-muted-foreground">
          {currentView === 'initiatives' && (
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} />
              <span>
                {initiativeCount === totalInitiativeCount 
                  ? `${initiativeCount} инициатив` 
                  : `${initiativeCount} из ${totalInitiativeCount}`
                }
              </span>
            </div>
          )}
          {currentView === 'people' && (
            <div className="flex items-center gap-2">
              <Users size={16} />
              <span>{peopleCount} чел.</span>
            </div>
          )}
          {renderSyncStatus()}
        </div>
      )}

      {/* Actions */}
      <div className="ml-auto flex items-center gap-2">
        {currentView === 'initiatives' ? (
          <UnifiedSettingsMenu
            onImportInitiatives={onImportClick}
            onExportAllInitiatives={onDownloadAll}
            onExportFilteredInitiatives={onDownloadFiltered}
            initiativesTotal={totalInitiativeCount}
            initiativesFiltered={initiativeCount}
            hasInitiativeFilters={hasFilters}
            hasData={hasData}
          />
        ) : (
          <UnifiedSettingsMenu
            onImportPeople={onImportPeople}
          />
        )}
      </div>
    </header>
  );
};

export default AdminHeader;
