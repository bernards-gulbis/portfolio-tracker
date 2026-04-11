import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { LoginPage } from './components/LoginPage';
import { useLogout } from './hooks/useAuth';
import { PortfolioSwitcher } from './components/PortfolioSwitcher';
import { usePortfolios } from './hooks/usePortfolios';
import { usePortfolioStatus } from './hooks/usePortfolioStatus';
import { TransactionView } from './components/TransactionView';
import { PortfolioStatusView } from './components/PortfolioStatusView';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sun, Moon, LogOut, Settings, Briefcase, UserIcon, Languages, Check, DollarSign, LayoutDashboard, ArrowLeftRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, getCurrentLanguage } from './i18n/index';
import { useCurrencyPreference, CurrencyProvider } from './hooks/useCurrencyPreference';
import { CreatePortfolioModal } from './components/CreatePortfolioModal';
import { PortfolioActions } from './components/PortfolioActions';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsPage } from './components/SettingsPage';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { AppFooter } from './components/AppFooter';

// Module-scoped so AuthContext can call queryClient.clear() on logout
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const THEME_OPTIONS = [
  { value: 'light', key: 'app.header.themeLight' },
  { value: 'dark', key: 'app.header.themeDark' },
  { value: 'system', key: 'app.header.themeSystem' },
] as const;

const CURRENCY_OPTIONS = [
  { value: 'USD', key: 'status.currency.usdLabel' },
  { value: 'EUR', key: 'status.currency.eurLabel' },
] as const;

function CheckedItem({ checked, onClick, children }: Readonly<{ checked: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {checked ? <Check /> : <span className="w-4" />}
      {children}
    </DropdownMenuItem>
  );
}

function getAvatarInitials(name?: string | null, email?: string | null): string | null {
  if (name) {
    return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return null;
}

function AuthGuard() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginPage />;
  }

  return <AppLayout />;
}

function AppLayout() {
  const { theme, preference: themePreference, setPreference: setThemePreference } = useTheme();
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const { t, i18n } = useTranslation();
  const currentLang = getCurrentLanguage();
  const { currency, setCurrency } = useCurrencyPreference();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { data: portfolios, isLoading: isPortfoliosLoading, isFetching: isPortfoliosFetching } = usePortfolios();
  const { page, activePortfolioId, goToPortfolio, goToTransactions, goToFirstPortfolio, goToSettings } = useNavigation();
  const portfolioTab = page === 'transactions' ? 'transactions' : 'portfolio';
  const activePortfolio = portfolios?.find((p) => p.id === activePortfolioId);
  const { data: portfolioStatus } = usePortfolioStatus(activePortfolioId);
  const emptyRedirectedRef = useRef<number | null>(null);

  // Auto-navigate to Transactions for brand-new portfolios (no transactions entered yet)
  useEffect(() => {
    if (activePortfolioId === null || !portfolioStatus) return;
    if (emptyRedirectedRef.current === activePortfolioId) return;
    const isBrandNew = portfolioStatus.holdings.length === 0 && portfolioStatus.principal === 0;
    if (isBrandNew) {
      emptyRedirectedRef.current = activePortfolioId;
      goToTransactions();
    }
  }, [activePortfolioId, portfolioStatus, goToTransactions]);

  // Auto-select first portfolio when none is selected, or when the stored ID no longer exists
  useEffect(() => {
    if (!portfolios || isPortfoliosFetching) return;
    if (portfolios.length === 0) {
      if (activePortfolioId !== null) goToFirstPortfolio();
      return;
    }
    if (activePortfolioId === null || !portfolios.some((p) => p.id === activePortfolioId)) {
      goToPortfolio(portfolios[0].id);
    }
  }, [activePortfolioId, portfolios, isPortfoliosFetching, goToPortfolio, goToFirstPortfolio]);

  const renderMainContent = () => {
    if (page === 'settings') {
      return (
        <ErrorBoundary fullScreen={false}>
          <SettingsPage />
        </ErrorBoundary>
      );
    }

    // Portfolio page
    if (activePortfolioId === null) {
      if (isPortfoliosLoading) {
        return (
          <div className="flex items-center justify-center py-12">
            <Skeleton className="h-12 w-48" />
          </div>
        );
      }

      if (!portfolios || portfolios.length === 0) {
        return (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Briefcase />
              </EmptyMedia>
              <EmptyTitle>{t('portfolio.list.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('portfolio.list.empty.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        );
      }

      return null; // useEffect will auto-select first portfolio
    }

    return (
      <ErrorBoundary fullScreen={false}>
        {portfolioTab === 'portfolio' ? <PortfolioStatusView /> : <TransactionView />}
      </ErrorBoundary>
    );
  };

  return (
    <>
      <div className="flex min-h-screen flex-col">
        <header className="border-b px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <PortfolioSwitcher activePortfolioId={activePortfolioId} onCreateClick={() => setIsCreateModalOpen(true)} />
              {activePortfolio == null ? null : (
                <PortfolioActions portfolioId={activePortfolio.id} portfolioName={activePortfolio.name} />
              )}
            </div>
            {page !== 'settings' && activePortfolioId !== null && (
              <Tabs
                value={portfolioTab}
                onValueChange={(value) => {
                  if (value === 'transactions') {
                    goToTransactions();
                  } else if (activePortfolioId !== null) {
                    goToPortfolio(activePortfolioId);
                  }
                }}
              >
                <TabsList variant="line">
                  <TabsTrigger value="portfolio">
                    <LayoutDashboard className="h-4 w-4" />
                    {t('nav.summary')}
                  </TabsTrigger>
                  <TabsTrigger value="transactions">
                    <ArrowLeftRight className="h-4 w-4" />
                    {t('nav.transactions')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={t('app.header.userMenu')}>
                <Avatar>
                  {user?.picture && <AvatarImage src={user.picture} alt={user.name ?? user.email} />}
                  <AvatarFallback>
                    {getAvatarInitials(user?.name, user?.email) ?? <UserIcon className="h-4 w-4" />}
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {theme === 'light' ? <Sun /> : <Moon />}
                  {t('app.header.themeLabel')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {THEME_OPTIONS.map(({ value, key }) => (
                    <CheckedItem key={value} checked={value === themePreference} onClick={() => setThemePreference(value)}>
                      {t(key)}
                    </CheckedItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Languages />
                  {t('language.switchLabel')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <CheckedItem key={lang} checked={lang === currentLang} onClick={() => i18n.changeLanguage(lang)}>
                      {t(`language.${lang}`)}
                    </CheckedItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <DollarSign />
                  {t('status.currency.toggle')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {CURRENCY_OPTIONS.map(({ value, key }) => (
                    <CheckedItem key={value} checked={value === currency} onClick={() => setCurrency(value)}>
                      {t(key)}
                    </CheckedItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => goToSettings()}>
                <Settings />
                {t('settings.menuItem')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? <Spinner /> : <LogOut />}
                {t('app.header.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-6">
          {renderMainContent()}
        </main>

        <AppFooter className="border-t" />
      </div>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CurrencyProvider>
          <AuthProvider>
            <NavigationProvider>
              <ErrorBoundary>
                <AuthGuard />
              </ErrorBoundary>
            </NavigationProvider>
          </AuthProvider>
          <Toaster position="bottom-right" />
        </CurrencyProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
