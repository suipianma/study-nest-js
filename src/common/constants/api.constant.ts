export const USER_ID_HEADER = 'x-user-id';

// 普通 HTTP 接口超时（毫秒），SSE 流式接口排除
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

// Ollama 调用超时
export const OLLAMA_CHAT_TIMEOUT_MS = 120_000;
export const OLLAMA_STREAM_TIMEOUT_MS = 300_000;
