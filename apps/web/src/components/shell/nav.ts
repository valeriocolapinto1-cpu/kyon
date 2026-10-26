import { Home, FolderKanban, MessagesSquare, Settings, type LucideIcon } from 'lucide-react';
import { it } from '@/lib/i18n/it';

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: it.nav.home, Icon: Home },
  { href: '/progetti', label: it.nav.projects, Icon: FolderKanban },
  { href: '/chat', label: it.nav.chat, Icon: MessagesSquare },
  { href: '/settings', label: it.nav.settings, Icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
