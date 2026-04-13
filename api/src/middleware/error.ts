import { ErrorRequestHandler } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function createError(
  message: string,
  statusCode = 500,
  code = 'INTERNAL_ERROR'
): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export const errorHandler: ErrorRequestHandler = (err: AppError, _req, res, _next) => {
  const status = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message;

  if (status === 500) {
    console.error('[ERROR]', err);
  }

  res.status(status).json({ error: { message, code } });
};
