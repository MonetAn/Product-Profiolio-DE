import {
  Users,
  ClipboardList,
  Shield,
  Activity,
  LayoutDashboard,
  Globe2,
  ShieldAlert,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useAccess } from '@/hooks/useAccess';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import UnifiedSettingsMenu from './UnifiedSettingsMenu';

export type ViewMode = 'initiatives' | 'people' | 'markets' | 'access' | 'activity' | 'sensitive';

interface AdminHeaderProps {
  currentView: ViewMode;
  initiativeCount?: number;
  totalInitiativeCount?: number;
  peopleCount?: number;
  hasData?: boolean;
  hasFilters?: boolean;
  onImportClick?: () => void;
  onDownloadAll?: () => void;
  onDownloadFiltered?: () => void;
  onDownloadGeoSplitAll?: () => void;
  onDownloadGeoSplitFiltered?: () => void;
  onImportPeople?: () => void;
  onAddPerson?: () => void;
}

const AdminHeader = ({
  currentView,
  initiativeCount = 0,
  totalInitiativeCount = 0,
  hasData = false,
  hasFilters = false,
  onImportClick,
  onDownloadAll,
  onDownloadFiltered,
  onDownloadGeoSplitAll,
  onDownloadGeoSplitFiltered,
  onImportPeople,
  onAddPerson,
}: AdminHeaderProps) => {
  const [searchParams] = useSearchParams();
  const { isSuperAdmin } = useAccess();

  // Build URLs preserving current filters
  const initiativesUrl = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `/admin?${queryString}` : '/admin';
  }, [searchParams]);
  
  const peopleUrl = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `/admin/people?${queryString}` : '/admin/people';
  }, [searchParams]);

  const dashboardUrl = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `/?${queryString}` : '/';
  }, [searchParams]);

  const marketsUrl = '/admin/markets';

  const accessUrl = '/admin/access';
  const activityUrl = '/admin/activity';
  const sensitiveUrl = '/admin/sensitive';

  return (
    <header className="h-14 w-full min-w-0 bg-header border-b border-border flex items-center px-4 sm:px-6 shrink-0">
      <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 sm:px-3 shrink-0" asChild>
        <Link to={dashboardUrl} aria-label="К дашборду">
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline text-sm font-medium">К дашборду</span>
        </Link>
      </Button>

      {/* Navigation Toggle */}
      <div className="ml-4">
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
              <span className="hidden sm:inline">Заполнение</span>
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
          <Link to={marketsUrl}>
            <ToggleGroupItem
              value="markets"
              className="gap-1.5 px-3 h-8 text-sm font-medium rounded-md transition-all data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              <Globe2 className="h-4 w-4" />
              <span className="hidden sm:inline">Рынки</span>
            </ToggleGroupItem>
          </Link>
          <Link to={accessUrl}>
            <ToggleGroupItem 
              value="access" 
              className="gap-1.5 px-3 h-8 text-sm font-medium rounded-md transition-all data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Доступ</span>
            </ToggleGroupItem>
          </Link>
          <Link to={activityUrl}>
            <ToggleGroupItem 
              value="activity" 
              className="gap-1.5 px-3 h-8 text-sm font-medium rounded-md transition-all data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Активность</span>
            </ToggleGroupItem>
          </Link>
          {isSuperAdmin && (
            <Link to={sensitiveUrl}>
              <ToggleGroupItem
                value="sensitive"
                className="gap-1.5 px-3 h-8 text-sm font-medium rounded-md transition-all data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
              >
                <ShieldAlert className="h-4 w-4" />
                <span className="hidden sm:inline">Sensitive</span>
              </ToggleGroupItem>
            </Link>
          )}
        </ToggleGroup>
      </div>

      {/* Actions */}
      <div className="ml-auto flex items-center gap-2">
        {currentView === 'initiatives' && (
          <UnifiedSettingsMenu
            onImportInitiatives={onImportClick}
            onExportAllInitiatives={onDownloadAll}
            onExportFilteredInitiatives={onDownloadFiltered}
            onExportGeoSplitAll={onDownloadGeoSplitAll}
            onExportGeoSplitFiltered={onDownloadGeoSplitFiltered}
            initiativesTotal={totalInitiativeCount}
            initiativesFiltered={initiativeCount}
            hasInitiativeFilters={hasFilters}
            hasData={hasData}
          />
        )}
        {currentView === 'people' && (
          <UnifiedSettingsMenu
            onImportPeople={onImportPeople}
            onAddPerson={onAddPerson}
          />
        )}
      </div>
    </header>
  );
};

export default AdminHeader;
