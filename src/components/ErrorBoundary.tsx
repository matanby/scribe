import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    resetKey: 0
  };

  public static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'error'> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-[var(--editor-bg)] text-[var(--text-primary)]">
          <h2 className="text-base font-semibold mb-2">Something went wrong</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() =>
              // Bumping the key remounts the subtree. Clearing the flag alone re-rendered
              // the same failed instance, which just threw again immediately.
              this.setState(prev => ({
                hasError: false,
                error: null,
                resetKey: prev.resetKey + 1
              }))
            }
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
