import { useState } from 'react';
import { Settings, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PeopleListDialog from './people/PeopleListDialog';
import UnitTeamMappingDialog from './people/UnitTeamMappingDialog';

interface UnifiedSettingsMenuProps {
  // Импорт
  onImportInitiatives?: () => void;
  onImportPeople?: () => void;
  
  // Экспорт инициатив
  onExportAllInitiatives?: () => void;
  onExportFilteredInitiatives?: () => void;
  initiativesTotal?: number;
  initiativesFiltered?: number;
  hasInitiativeFilters?: boolean;
  
  // Экспорт людей (на будущее)
  onExportPeople?: () => void;
  hasPeopleData?: boolean;
  
  // Общее
  hasData?: boolean;
}

export default function UnifiedSettingsMenu({
  onImportInitiatives,
  onImportPeople,
  onExportAllInitiatives,
  onExportFilteredInitiatives,
  initiativesTotal = 0,
  initiativesFiltered = 0,
  hasInitiativeFilters = false,
  onExportPeople,
  hasPeopleData = false,
  hasData = true,
}: UnifiedSettingsMenuProps) {
  const [peopleListOpen, setPeopleListOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  const hasExportInitiatives = onExportAllInitiatives || onExportFilteredInitiatives;
  const hasImport = onImportInitiatives || onImportPeople;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <Settings size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Секция: ДАННЫЕ */}
          {(hasImport || hasExportInitiatives || onExportPeople) && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                📤 ДАННЫЕ
              </DropdownMenuLabel>
              
              {/* Импорт */}
              {onImportInitiatives && (
                <DropdownMenuItem onClick={onImportInitiatives}>
                  <Upload size={14} className="mr-2" />
                  Импорт инициатив (CSV)
                </DropdownMenuItem>
              )}
              {onImportPeople && (
                <DropdownMenuItem onClick={onImportPeople}>
                  <Upload size={14} className="mr-2" />
                  Импорт сотрудников (CSV)
                </DropdownMenuItem>
              )}
              
              {/* Экспорт инициатив */}
              {onExportAllInitiatives && (
                <DropdownMenuItem onClick={onExportAllInitiatives} disabled={!hasData}>
                  <Download size={14} className="mr-2" />
                  Экспорт: Все инициативы ({initiativesTotal})
                </DropdownMenuItem>
              )}
              {hasInitiativeFilters && onExportFilteredInitiatives && (
                <DropdownMenuItem onClick={onExportFilteredInitiatives} disabled={!hasData}>
                  <Download size={14} className="mr-2" />
                  Экспорт: Отфильтрованные ({initiativesFiltered})
                </DropdownMenuItem>
              )}
              
              {/* Экспорт людей (на будущее) */}
              {onExportPeople && (
                <DropdownMenuItem onClick={onExportPeople} disabled={!hasPeopleData}>
                  <Download size={14} className="mr-2" />
                  Экспорт сотрудников (CSV)
                </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
            </>
          )}
          
          {/* Секция: СПРАВОЧНИКИ */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            🔧 СПРАВОЧНИКИ
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setPeopleListOpen(true)}>
            👁️ Просмотр сотрудников
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMappingOpen(true)}>
            🔄 Синонимы Unit/Team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PeopleListDialog 
        open={peopleListOpen} 
        onOpenChange={setPeopleListOpen} 
      />
      
      <UnitTeamMappingDialog 
        open={mappingOpen} 
        onOpenChange={setMappingOpen} 
      />
    </>
  );
}
