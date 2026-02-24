import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { useLogout } from './hooks/useAuth';
import PortfolioList from './components/PortfolioList';
import TransactionView from './components/TransactionView';
import { PortfolioStatusView } from './components/PortfolioStatusView';
import { AppBreadcrumbs } from './components/AppBreadcrumbs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { Sun, Moon, LogOut, Settings, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';
import CreatePortfolioModal from './components/CreatePortfolioModal';
import { SettingsLayout, ProfileSection, PasswordSection, AccountSection } from './components/SettingsPage';

// Module-scoped so AuthContext can call queryClient.clear() on logout
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AuthGuard() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginPage />;
  }

  return <Outlet />;
}

function AppLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="border-b px-4 py-3">
          <span className="text-lg font-semibold">{t('app.title')}</span>
        </SidebarHeader>
        <SidebarContent>
          <PortfolioList />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith('/settings')}>
                <Link to="/settings">
                  <Settings />
                  <span>{t('settings.menuItem')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="border-b px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 !h-4" />
            <AppBreadcrumbs />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('portfolio.list.newButton')}
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={toggleTheme} aria-label={t('app.header.toggleTheme')}>
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {theme === 'light' ? t('app.header.switchToDark') : t('app.header.switchToLight')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <LanguageSwitcher />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={t('app.header.userMenu')}>
                  <Avatar>
                    {user?.picture && <AvatarImage src={user.picture} alt={user.name ?? user.email} />}
                    <AvatarFallback>
                      {user?.name
                        ? user.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                        : user?.email?.slice(0, 2).toUpperCase() ?? '??'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  {user?.name && <p className="text-sm font-medium truncate">{user.name}</p>}
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? <Spinner className="mr-2" /> : <LogOut className="mr-2 h-4 w-4" />}
                  {t('app.header.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </SidebarProvider>
  );
}

function PortfolioPage() {
  return (
    <>
      <PortfolioStatusView />
      <TransactionView />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route element={<AuthGuard />}>
                <Route element={<AppLayout />}>
                  <Route index element={<PortfolioPage />} />
                  <Route path="portfolios/:id" element={<PortfolioPage />} />
                  <Route path="settings" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="profile" replace />} />
                    <Route path="profile" element={<ProfileSection />} />
                    <Route path="password" element={<PasswordSection />} />
                    <Route path="account" element={<AccountSection />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
