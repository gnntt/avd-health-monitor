/**
 * Custom error types for AVD Health Monitor application
 * Provides structured error handling for endpoint tests and app state
 */

// Base error class for all application errors
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly timestamp: number;
  readonly recoverable: boolean;

  constructor(message: string, code: ErrorCode, recoverable = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.timestamp = Date.now();
    this.recoverable = recoverable;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Error codes for categorizing errors
export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  DNS_RESOLUTION_FAILED = 'DNS_RESOLUTION_FAILED',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  CONNECTION_RESET = 'CONNECTION_RESET',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_ENDPOINT = 'INVALID_ENDPOINT',
  INVALID_CONFIG = 'INVALID_CONFIG',

  // State errors
  STATE_ERROR = 'STATE_ERROR',
  STORE_UPDATE_FAILED = 'STORE_UPDATE_FAILED',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Network-specific errors
export class NetworkError extends AppError {
  readonly endpoint?: string;

  constructor(message: string, code: ErrorCode = ErrorCode.NETWORK_ERROR, endpoint?: string) {
    super(message, code, true);
    this.name = 'NetworkError';
    this.endpoint = endpoint;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class TimeoutError extends NetworkError {
  readonly timeoutMs?: number;

  constructor(message: string, endpoint?: string, timeoutMs?: number) {
    super(message, ErrorCode.NETWORK_TIMEOUT, endpoint);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class ConnectionError extends NetworkError {
  constructor(message: string, code: ErrorCode, endpoint?: string) {
    super(message, code, endpoint);
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

// Parse backend error messages into appropriate error types
export function parseBackendError(error: unknown, endpoint?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Check for timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return new TimeoutError(`Connection timed out: ${message}`, endpoint);
  }

  // Check for DNS errors
  if (lowerMessage.includes('dns') || lowerMessage.includes('resolve') || lowerMessage.includes('getaddrinfo')) {
    return new ConnectionError(`DNS resolution failed: ${message}`, ErrorCode.DNS_RESOLUTION_FAILED, endpoint);
  }

  // Check for connection refused
  if (lowerMessage.includes('connection refused') || lowerMessage.includes('econnrefused')) {
    return new ConnectionError(`Connection refused: ${message}`, ErrorCode.CONNECTION_REFUSED, endpoint);
  }

  // Check for connection reset
  if (lowerMessage.includes('connection reset') || lowerMessage.includes('econnreset')) {
    return new ConnectionError(`Connection reset: ${message}`, ErrorCode.CONNECTION_RESET, endpoint);
  }

  // Check for general network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('socket') || lowerMessage.includes('enetunreach')) {
    return new NetworkError(`Network error: ${message}`, ErrorCode.NETWORK_ERROR, endpoint);
  }

  // Default to unknown error
  return new AppError(message, ErrorCode.UNKNOWN_ERROR);
}

// Get user-friendly error message
export function getUserFriendlyErrorMessage(error: AppError): string {
  switch (error.code) {
    case ErrorCode.NETWORK_TIMEOUT:
      return 'Connection timed out';
    case ErrorCode.DNS_RESOLUTION_FAILED:
      return 'DNS lookup failed';
    case ErrorCode.CONNECTION_REFUSED:
      return 'Connection refused';
    case ErrorCode.CONNECTION_RESET:
      return 'Connection reset';
    case ErrorCode.NETWORK_ERROR:
      return 'Network error';
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.INVALID_ENDPOINT:
    case ErrorCode.INVALID_CONFIG:
      return 'Invalid configuration';
    default:
      return 'Connection failed';
  }
}

// Type guard to check if value is an AppError
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
