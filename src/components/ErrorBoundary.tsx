import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppError, ErrorCode } from '../errors';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error details
    console.error('ErrorBoundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const error = this.state.error;
      const isAppError = error instanceof AppError;
      const isRecoverable = isAppError ? error.recoverable : true;

      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full">
                <AlertTriangle className="w-12 h-12 text-red-500" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
              Something went wrong
            </h1>

            <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
              {isAppError
                ? this.getErrorMessage(error as AppError)
                : 'An unexpected error occurred in the application.'}
            </p>

            {error && (
              <details className="mb-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                  Technical Details
                </summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                    <span className="font-semibold">Error:</span> {error.message}
                  </p>
                  {isAppError && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                      <span className="font-semibold">Code:</span> {(error as AppError).code}
                    </p>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <pre className="text-xs text-gray-500 dark:text-gray-500 overflow-auto max-h-32 mt-2">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {isRecoverable && (
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              )}
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }

  private getErrorMessage(error: AppError): string {
    switch (error.code) {
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.NETWORK_TIMEOUT:
      case ErrorCode.DNS_RESOLUTION_FAILED:
      case ErrorCode.CONNECTION_REFUSED:
      case ErrorCode.CONNECTION_RESET:
        return 'A network error occurred. Please check your connection and try again.';
      case ErrorCode.VALIDATION_ERROR:
      case ErrorCode.INVALID_ENDPOINT:
      case ErrorCode.INVALID_CONFIG:
        return 'Invalid configuration detected. Please check your settings.';
      case ErrorCode.STATE_ERROR:
      case ErrorCode.STORE_UPDATE_FAILED:
        return 'A state error occurred. Please try refreshing the page.';
      default:
        return 'An unexpected error occurred. Please try again or reload the application.';
    }
  }
}
