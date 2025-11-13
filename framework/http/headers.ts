import { HttpError } from '../errors/HttpError';

export function requireBearerToken(headerValue: string | null): string {
  if (!headerValue) {
    throw new HttpError(401, 'Missing Authorization header');
  }
  const [scheme, token] = headerValue.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') {
    throw new HttpError(401, 'Malformed Authorization header');
  }
  return token;
}
