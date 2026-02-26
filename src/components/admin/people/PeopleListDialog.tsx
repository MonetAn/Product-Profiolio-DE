import { useState, useMemo } from 'react';
import { Search, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePeople, usePeopleFilters } from '@/hooks/usePeople';
import PersonEditDialog from './PersonEditDialog';
import { Person } from '@/lib/peopleDataManager';

interface PeopleListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PeopleListDialog({ open, onOpenChange }: PeopleListDialogProps) {
  const { data: people = [] } = usePeople();
  const { units, teams } = usePeopleFilters(people);
  
  const [search, setSearch] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [editPerson, setEditPerson] = useState<Person | null>(null);

  const filteredPeople = useMemo(() => {
    return people.filter(person => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        if (!person.full_name.toLowerCase().includes(searchLower) &&
            !person.email?.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // Unit filter
      if (selectedUnit !== 'all' && person.unit !== selectedUnit) {
        return false;
      }
      
      // Team filter
      if (selectedTeam !== 'all' && person.team !== selectedTeam) {
        return false;
      }
      
      return true;
    });
  }, [people, search, selectedUnit, selectedTeam]);

  // Get teams for selected unit
  const availableTeams = useMemo(() => {
    if (selectedUnit === 'all') return teams;
    return [...new Set(people
      .filter(p => p.unit === selectedUnit)
      .map(p => p.team)
      .filter(Boolean)
    )] as string[];
  }, [people, selectedUnit, teams]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              👥 Справочник сотрудников
              <Badge variant="secondary">{filteredPeople.length} из {people.length}</Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={selectedUnit} onValueChange={(v) => {
              setSelectedUnit(v);
              setSelectedTeam('all');
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все Unit</SelectItem>
                {units.map(unit => (
                  <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все Team</SelectItem>
                {availableTeams.map(team => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <ScrollArea className="flex-1 border rounded-md">
            <div className="min-w-[600px]">
              {/* Header */}
              <div className="grid grid-cols-[1fr_150px_150px_50px] gap-2 px-4 py-2 bg-muted/50 border-b text-sm font-medium sticky top-0">
                <div>ФИО</div>
                <div>Unit</div>
                <div>Team</div>
                <div></div>
              </div>
              
              {/* Rows */}
              {filteredPeople.map(person => (
                <div 
                  key={person.id} 
                  className="grid grid-cols-[1fr_150px_150px_50px] gap-2 px-4 py-2 border-b last:border-0 hover:bg-muted/30 items-center text-sm"
                >
                  <div>
                    <div className="font-medium">{person.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {person.email || person.position}
                    </div>
                  </div>
                  <div className="text-muted-foreground truncate">{person.unit || '—'}</div>
                  <div className="text-muted-foreground truncate">{person.team || '—'}</div>
                  <div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setEditPerson(person)}
                    >
                      <Pencil size={14} />
                    </Button>
                  </div>
                </div>
              ))}
              
              {filteredPeople.length === 0 && (
                <div className="px-4 py-8 text-center text-muted-foreground">
                  Сотрудники не найдены
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {editPerson && (
        <PersonEditDialog
          person={editPerson}
          open={!!editPerson}
          onOpenChange={(open) => !open && setEditPerson(null)}
        />
      )}
    </>
  );
}
