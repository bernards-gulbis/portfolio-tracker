import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useMatch } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { useLogout } from './hooks/useAuth';
import { PortfolioSwitcher } from './components/PortfolioSwitcher';
import { usePortfolios } from './hooks/usePortfolios';
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
import { Sun, Moon, LogOut, Settings, Briefcase, UserIcon, Languages, Check, DollarSign } from 'lucide-react';
import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, getCurrentLanguage } from './i18n/index';
import { useCurrencyPreference, CurrencyProvider } from './hooks/useCurrencyPreference';
import { CreatePortfolioModal } from './components/CreatePortfolioModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsLayout, ProfileSection, PasswordSection, TaxSection, AccountSection } from './components/SettingsPage';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

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

const CreatePortfolioContext = createContext<(() => void) | null>(null);

function CheckedItem({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {checked ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 w-4" />}
      {children}
    </DropdownMenuItem>
  );
}

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
  const { theme, preference: themePreference, setPreference: setThemePreference } = useTheme();
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const { t, i18n } = useTranslation();
  const currentLang = getCurrentLanguage();
  const { currency, setCurrency } = useCurrencyPreference();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { data: portfolios } = usePortfolios();
  const portfolioMatch = useMatch('/portfolios/:id');
  const matchedId = portfolioMatch?.params.id ? Number(portfolioMatch.params.id) : null;
  const activePortfolioId = matchedId && Number.isFinite(matchedId) ? matchedId : null;
  // Derive the "remembered" portfolio ID from the current route and portfolio list.
  // Uses useMemo so we never need a ref or setState during render/effects.
  const [prevActiveId, setPrevActiveId] = useState<number | null>(null);
  const [lastPortfolioId, setLastPortfolioId] = useState<number | null>(null);

  // Adjust state during render (React-recommended pattern for deriving state from props)
  if (activePortfolioId !== prevActiveId) {
    setPrevActiveId(activePortfolioId);
    if (activePortfolioId !== null) {
      setLastPortfolioId(activePortfolioId);
    }
  }

  const rememberedId = useMemo(() => {
    if (activePortfolioId !== null) return activePortfolioId;
    if (lastPortfolioId !== null && portfolios?.some((p) => p.id === lastPortfolioId)) {
      return lastPortfolioId;
    }
    return null;
  }, [activePortfolioId, lastPortfolioId, portfolios]);

  const openCreateModal = useCallback(() => setIsCreateModalOpen(true), []);

  return (
    <CreatePortfolioContext.Provider value={openCreateModal}>
      <div className="flex min-h-screen flex-col">
        <header className="border-b px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PortfolioSwitcher activePortfolioId={rememberedId} onCreateClick={() => setIsCreateModalOpen(true)} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={t('app.header.userMenu')}>
                <Avatar>
                  {user?.picture && <AvatarImage src={user.picture} alt={user.name ?? user.email} />}
                  <AvatarFallback>
                    {user?.name
                      ? user.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                      : user?.email
                        ? user.email.slice(0, 2).toUpperCase()
                        : <UserIcon className="h-4 w-4" />}
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
                  {theme === 'light' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
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
                  <Languages className="mr-2 h-4 w-4" />
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
                  <DollarSign className="mr-2 h-4 w-4" />
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
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t('settings.menuItem')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? <Spinner className="mr-2" /> : <LogOut className="mr-2 h-4 w-4" />}
                {t('app.header.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </CreatePortfolioContext.Provider>
  );
}

function PortfolioRedirect() {
  const { data: portfolios, isLoading } = usePortfolios();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (portfolios && portfolios.length > 0) {
    return <Navigate to={`/portfolios/${portfolios[0].id}`} replace />;
  }

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
        <CurrencyProvider>
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
                <Routes>
                  <Route element={<AuthGuard />}>
                    <Route element={<AppLayout />}>
                      <Route index element={<PortfolioRedirect />} />
                      <Route path="portfolios/:id" element={<ErrorBoundary fullScreen={false}><PortfolioPage /></ErrorBoundary>} />
                      <Route path="settings" element={<ErrorBoundary fullScreen={false}><SettingsLayout /></ErrorBoundary>}>
                        <Route index element={<Navigate to="profile" replace />} />
                        <Route path="profile" element={<ProfileSection />} />
                        <Route path="password" element={<PasswordSection />} />
                        <Route path="tax" element={<TaxSection />} />
                        <Route path="account" element={<AccountSection />} />
                      </Route>
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Route>
                </Routes>
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
          <Toaster position="bottom-right" />
        </CurrencyProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
