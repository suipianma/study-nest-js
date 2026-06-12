import { USER_ID_HEADER } from '../constants/api.constant';

interface JwtPayload {
  userId?: number;
}

function parseUserId(value?: string | string[]): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return null;

  const userId = Number(raw);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

function extractUserIdFromToken(authorization?: string): number | null {
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    const token = authorization.slice(7);
    const segment = token.split('.')[1];
    if (!segment) return null;

    const payload = JSON.parse(
      Buffer.from(segment, 'base64').toString('utf8'),
    ) as JwtPayload;

    return typeof payload.userId === 'number' ? payload.userId : null;
  } catch {
    return null;
  }
}

export function resolveUserId(options: {
  headerValue?: string | string[];
  queryValue?: string;
  authorization?: string;
}): number | null {
  return (
    parseUserId(options.headerValue) ??
    parseUserId(options.queryValue) ??
    extractUserIdFromToken(options.authorization)
  );
}

export { USER_ID_HEADER };
