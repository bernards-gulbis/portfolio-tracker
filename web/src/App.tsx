import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PortfolioProvider } from './context/PortfolioContext';
import PortfolioList from './components/PortfolioList';
import TransactionView from './components/TransactionView';
import './App.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PortfolioProvider>
        <div className="app">
          <header className="app-header">
            <h1>Portfolio Tracker</h1>
          </header>

          <main className="app-main">
            <div className="app-layout">
              <aside className="app-sidebar">
                <PortfolioList />
              </aside>
              <section className="app-content">
                <TransactionView />
              </section>
            </div>
          </main>
        </div>
      </PortfolioProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
