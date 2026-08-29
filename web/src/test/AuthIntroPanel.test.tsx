import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthIntroPanel } from '../components/AuthIntroPanel';
import en from '../i18n/locales/en';

describe('AuthIntroPanel', () => {
  const { intro } = en.auth;

  it('renders the headline', () => {
    render(<AuthIntroPanel />);
    expect(screen.getByText(intro.headline)).toBeInTheDocument();
  });

  it('renders the tagline explaining what the app does', () => {
    render(<AuthIntroPanel />);
    expect(screen.getByText(intro.tagline)).toBeInTheDocument();
  });

  it('states that the app is free to use', () => {
    render(<AuthIntroPanel />);
    expect(screen.getByText(intro.freeBadge)).toBeInTheDocument();
  });

  it('renders all three feature titles and descriptions', () => {
    render(<AuthIntroPanel />);
    for (const feature of Object.values(intro.features)) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
      expect(screen.getByText(feature.description)).toBeInTheDocument();
    }
  });

  it('applies a className passed via props', () => {
    const { container } = render(<AuthIntroPanel className="custom-class" />);
    expect(container.firstElementChild?.className).toContain('custom-class');
  });
});
