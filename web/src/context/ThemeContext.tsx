import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Guard against non-browser environments (tests/SSR)
    if (typeof window === 'undefined') {
      return 'dark';
    }

    // Check localStorage for saved theme preference
    try {
      const savedTheme = localStorage.getItem('theme');
      // Validate that savedTheme is actually 'light' or 'dark'
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
    } catch (error) {
      // localStorage may throw in privacy mode or when storage is blocked
      console.warn('Failed to access localStorage:', error);
    }

    return 'dark';
  });

  useEffect(() => {
    // Guard against non-browser environments
    if (typeof window === 'undefined') {
      return;
    }

    // Update document class and save to localStorage
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      // localStorage may throw in privacy mode or when storage is blocked
      console.warn('Failed to save theme to localStorage:', error);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
