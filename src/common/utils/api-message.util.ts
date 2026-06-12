export function normalizeApiMessage(
  message: unknown,
  fallback = '服务器错误',
): string {
  if (Array.isArray(message)) {
    return message.map(String).join('，');
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (message && typeof message === 'object' && 'message' in message) {
    return normalizeApiMessage(
      (message as { message: unknown }).message,
      fallback,
    );
  }
  return fallback;
}
