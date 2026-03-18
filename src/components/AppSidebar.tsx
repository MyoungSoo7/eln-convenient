import {
  LayoutDashboard, FileText, FlaskConical, Package, CalendarDays,
  Search, ShieldCheck, ClipboardList, FileDown, Settings,
  Users, Building2, BookOpen, ChevronDown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { currentUser } from "@/lib/mockData";

const mainItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard },
  { title: "연구노트", url: "/notes", icon: FileText },
  { title: "프로토콜 / 템플릿", url: "/protocols", icon: BookOpen },
  { title: "인벤토리", url: "/inventory", icon: Package },
  { title: "스케줄러", url: "/scheduler", icon: CalendarDays },
  { title: "통합검색", url: "/search", icon: Search },
];

const complianceItems = [
  { title: "전자서명", url: "/signatures", icon: ShieldCheck },
  { title: "감사로그", url: "/audit-logs", icon: ClipboardList },
  { title: "내보내기 (PDF/ZIP)", url: "/exports", icon: FileDown },
];

const adminItems = [
  { title: "조직 / 팀 / 사용자", url: "/admin/users", icon: Users },
  { title: "역할 / 권한", url: "/admin/roles", icon: Building2 },
  { title: "설정", url: "/admin/settings", icon: Settings },
];

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
              <p className="text-[10px] text-sidebar-foreground/50">전자연구노트 플랫폼</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarNavGroup label="메인" items={mainItems} />
        <SidebarNavGroup label="규정 준수" items={complianceItems} />
        <SidebarNavGroup label="관리" items={adminItems} defaultOpen={false} />
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-primary">
              {currentUser.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{currentUser.name}</p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">{currentUser.team}</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
