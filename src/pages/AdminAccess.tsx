import { useState, useEffect, useCallback } from 'react';
import { Loader2, UserPlus, Trash2, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import AdminHeader from '@/components/admin/AdminHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type AllowedUserRow = Database['public']['Tables']['allowed_users']['Row'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) && trimmed.endsWith('@dodobrands.io');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function AdminAccess() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentEmail = user?.email?.toLowerCase() ?? '';

  const [list, setList] = useState<AllowedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('allowed_users').select('*').order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Ошибка загрузки', description: error.message, variant: 'destructive' });
      setList([]);
    } else {
      setList(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const adminCount = list.filter((r) => r.role === 'admin').length;
  const isSelf = (row: AllowedUserRow) => row.email.toLowerCase() === currentEmail;
  const isLastAdmin = (row: AllowedUserRow) => row.role === 'admin' && adminCount <= 1;
  const cannotDemoteSelf = (row: AllowedUserRow) => isSelf(row) && isLastAdmin(row);

  const handleAdd = async () => {
    const email = normalizeEmail(addEmail);
    if (!email) {
      toast({ title: 'Введите email', variant: 'destructive' });
      return;
    }
    if (!isValidEmail(addEmail)) {
      toast({ title: 'Некорректный email', description: 'Используйте корпоративный @dodobrands.io', variant: 'destructive' });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('allowed_users').insert({ email, role: 'user' });
    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Пользователь уже добавлен', description: email, variant: 'destructive' });
      } else {
        toast({ title: 'Ошибка добавления', description: error.message, variant: 'destructive' });
      }
      setAdding(false);
      return;
    }
    toast({ title: 'Добавлен', description: email });
    setAddEmail('');
    setAdding(false);
    fetchList();
  };

  const handleRoleChange = async (id: string, newRole: 'admin' | 'user') => {
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (cannotDemoteSelf(row)) {
      toast({ title: 'Вы последний админ', description: 'Назначьте другого админа перед сменой роли.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('allowed_users').update({ role: newRole }).eq('id', id);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Роль обновлена', description: `${row.email} — ${newRole === 'admin' ? 'Админ' : 'Пользователь'}` });
    fetchList();
  };

  const handleDelete = async (id: string) => {
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (isSelf(row)) {
      toast({ title: 'Нельзя удалить себя', variant: 'destructive' });
      return;
    }
    if (row.role === 'admin' && adminCount <= 1) {
      toast({ title: 'Нельзя удалить последнего админа', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('allowed_users').delete().eq('id', id);
    if (error) {
      toast({ title: 'Ошибка удаления', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Доступ удалён', description: row.email });
    fetchList();
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <AdminHeader currentView="access" />

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Добавить пользователя</h2>
            <p className="text-sm text-muted-foreground">
              Введите корпоративный email @dodobrands.io. Пользователь получит доступ к дашборду.
            </p>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="access-email" className="sr-only">Email</Label>
                <Input
                  id="access-email"
                  type="email"
                  placeholder="user@dodobrands.io"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  disabled={adding}
                />
              </div>
              <Button onClick={handleAdd} disabled={adding || !addEmail.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                <span className="ml-2">Добавить</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Пользователи с доступом</h2>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Пока никого нет. Добавьте первого пользователя выше.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead className="w-[180px]">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.email}
                        {isSelf(row) && (
                          <span className="ml-2 text-xs text-muted-foreground">(вы)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.role}
                          onValueChange={(v) => handleRoleChange(row.id, v as 'admin' | 'user')}
                          disabled={cannotDemoteSelf(row)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <span className="flex items-center gap-2">
                                <ShieldCheck size={14} /> Админ
                              </span>
                            </SelectItem>
                            <SelectItem value="user">
                              <span className="flex items-center gap-2">
                                <User size={14} /> Пользователь
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {cannotDemoteSelf(row) && (
                          <p className="text-xs text-amber-600 mt-1">Вы последний админ</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(row.id)}
                          disabled={isSelf(row) || (row.role === 'admin' && adminCount <= 1)}
                          title={isSelf(row) ? 'Нельзя удалить себя' : 'Удалить доступ'}
                        >
                          <Trash2 size={14} />
                          <span className="ml-1">Удалить</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
