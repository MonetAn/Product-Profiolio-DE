import {
  Building2,
  Code,
  CupSoda,
  Globe,
  Pencil,
  Pizza,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

function normalizeUnitKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Иконки юнитов для статичного вью (как на референсе слайдов). */
export function getTreemapUnitIcon(unitName: string): LucideIcon | null {
  const u = normalizeUnitKey(unitName);
  if (u.includes('app') && u.includes('web')) return Globe;
  if (u.includes('b2c') || (u.includes('b2b') && u.includes('pizza'))) return Pizza;
  if (u.includes('b2b')) return Pizza;
  if (u.includes('drinkit') || u.includes('дринкит')) return CupSoda;
  if (u.includes('client') && u.includes('platform')) return Users;
  if (u.includes('data') && u.includes('office')) return Building2;
  if (u.includes('tech') && u.includes('platform')) return Code;
  if (u === 'fap' || u.includes('фап')) return Wallet;
  if (u.includes('design') || u.includes('дизайн')) return Pencil;
  return null;
}
