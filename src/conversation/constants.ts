/** 单会话最大消息数 */
export const MAX_MESSAGES = Number(
  process.env.CONVERSATION_MAX_MESSAGES ?? 200,
);

/** 超过此数量启用摘要模式 */
export const SUMMARY_TRIGGER = Number(
  process.env.CONVERSATION_SUMMARY_TRIGGER ?? 40,
);

/** 发给模型的近期完整消息条数 */
export const RECENT_COUNT = Number(
  process.env.CONVERSATION_RECENT_COUNT ?? 20,
);

/** 摘要最大字符数，超出则二次压缩 */
export const SUMMARY_MAX_CHARS = Number(
  process.env.CONVERSATION_SUMMARY_MAX_CHARS ?? 2000,
);
