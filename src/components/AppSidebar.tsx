import {
  LayoutDashboard, FileText, FlaskConical, Package, CalendarDays,
  Search, ShieldCheck, ClipboardList, FileDown, Settings,
  Users, Building2, BookOpen, ChevronDown, Tag,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { currentUser } from "@/lib/types";
import { getStoredUser } from "@/lib/authToken";

function useCurrentUser() {
  const stored = getStoredUser();
  return {
    name: (stored?.name as string) || currentUser.name,
    team: (stored?.team as string) || '',
    org: (stored?.org as string) || '',
    role: (stored?.role as string) || currentUser.role,
  };
}


function SidebarNavGroup({ label, items, defaultOpen = true }: {
  label: string;
  items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[];
  defaultOpen?: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <SidebarGroup>
        <CollapsibleTrigger className="w-full">
          <SidebarGroupLabel className="flex items-center justify-between cursor-pointer text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors">
            {!collapsed && <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>}
            {!collapsed && <ChevronDown className="h-3 w-3" />}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url || (item.url !== '/' && location.pathname.startsWith(item.url))}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const user = useCurrentUser();
  const subLabel = user.team || user.org;
  const { t } = useTranslation('common');

  const mainItems = [
    { title: t('nav.dashboard'), url: "/", icon: LayoutDashboard },
    { title: t('nav.notes'), url: "/notes", icon: FileText },
    { title: t('nav.protocols'), url: "/protocols", icon: BookOpen },
    { title: t('nav.inventory'), url: "/inventory", icon: Package },
    { title: t('nav.scheduler'), url: "/scheduler", icon: CalendarDays },
    { title: t('nav.search'), url: "/search", icon: Search },
  ];

  const complianceItems = [
    { title: t('nav.signatures'), url: "/signatures", icon: ShieldCheck },
    { title: t('nav.auditLogs'), url: "/audit-logs", icon: ClipboardList },
    { title: t('nav.exports'), url: "/exports", icon: FileDown },
  ];

  const adminItems = [
    { title: t('nav.orgTeamUser'), url: "/admin/users", icon: Users },
    { title: t('nav.rolesPermissions'), url: "/admin/roles", icon: Building2 },
    { title: t('nav.codes'), url: "/admin/codes", icon: Tag },
    { title: t('nav.settings'), url: "/admin/settings", icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
            <FlaskConical className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-bold text-sidebar-foreground">LabNote</h2>
              <p className="text-[10px] text-sidebar-foreground/50">{t('sidebar.platformSubtitle')}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarNavGroup label={t('sidebar.main')} items={mainItems} />
        <SidebarNavGroup label={t('sidebar.compliance')} items={complianceItems} />
        {user.role === 'admin' && (
          <SidebarNavGroup label={t('sidebar.admin')} items={adminItems} defaultOpen={false} />
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-primary">
              {user.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
              {subLabel && (
                <p className="text-[10px] text-sidebar-foreground/50 truncate">{subLabel}</p>
              )}
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
