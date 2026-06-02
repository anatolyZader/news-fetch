export {
  AppError,
  ValidationError,
  NotFoundError,
  PermissionDeniedError,
  ExternalServiceError,
  isAppError,
} from './AppError.js';

export { registerAppErrorHandler } from './fastifyErrorHandler.js';
