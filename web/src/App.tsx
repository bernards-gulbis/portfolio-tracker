import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PortfolioProvider } from './context/PortfolioContext';
import { usePortfolioContext } from './context/PortfolioContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { useLogout } from './hooks/useAuth';
import PortfolioList from './components/PortfolioList';
import TransactionView from './components/TransactionView';
import { PortfolioStatusView } from './components/PortfolioStatusView';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Sun, Moon, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';

// Module-scoped so AuthContext can call queryClient.clear() on logout
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppContent() {
  const { activePortfolioId } = usePortfolioContext();
  const { theme, toggleTheme } = useTheme();
  const { status, user } = useAuth();
  const logoutMutation = useLogout();
  const { t } = useTranslation();

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

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b px-6 py-3 flex justify-between items-center">
        <h1 className="text-lg font-semibold">{t('app.title')}</h1>
        <div className="flex items-center gap-2">
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
                  <AvatarFallback>
                    {user?.email ? user.email.slice(0, 2).toUpperCase() : '??'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {logoutMutation.isPending ? t('app.header.signingOut') : t('app.header.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="grid grid-cols-[300px_1fr] gap-6 max-lg:grid-cols-1">
          <aside>
            <PortfolioList />
          </aside>
          <section>
            <PortfolioStatusView portfolioId={activePortfolioId} />
            <TransactionView />
          </section>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PortfolioProvider>
            <AppContent />
          </PortfolioProvider>
        </AuthProvider>
        <Toaster position="bottom-right" />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
