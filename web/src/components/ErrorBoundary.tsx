import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface Props extends WithTranslation {
  children: ReactNode;
  fullScreen?: boolean;
}

interface State {
  hasError: boolean;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      const fullScreen = this.props.fullScreen ?? true;
      return (
        <div className={`${fullScreen ? 'min-h-screen bg-background' : ''} flex flex-col items-center justify-center gap-4 py-12 text-foreground`}>
          <h1 className="text-2xl font-semibold tracking-tight">{t('errorBoundary.title')}</h1>
          <Button onClick={() => this.setState({ hasError: false })}>
            {t('errorBoundary.tryAgain')}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
