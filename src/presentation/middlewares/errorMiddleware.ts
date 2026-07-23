import { Request, Response, NextFunction } from 'express';

// Map application errors to HTTP status codes
export const errorHandler = (err: { name?: string; message?: string }, _req: Request, res: Response, _next: NextFunction): Response => {
  // Default to 500
  let status = 500;
  let message = 'Internal Server Error';

  if (err.name) {
    switch (err.name) {
      case 'ConversationNotFoundError':
        status = 404;
        message = err.message;
        break;
      case 'InvalidConversationStateError':
        status = 409;
        message = err.message;
        break;
      case 'TagAlreadyExistsError':
      case 'TagNotFoundError':
        status = 409;
        message = err.message;
        break;
      case 'AssignmentNotAllowedError':
        status = 403;
        message = err.message;
        break;
      default:
        // Keep default 500
        message = err.message || message;
    }
  }

  // Do not expose stack trace in production
  return res.status(status).json({ error: message });
};
