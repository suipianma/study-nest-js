/** 用户输入边界标记，用于 system prompt 隔离 */
export const USER_INPUT_START = '<<USER_INPUT>>';
export const USER_INPUT_END = '<</USER_INPUT>>';

/** 单条用户消息最大长度 */
export const MAX_USER_MESSAGE_LENGTH = 16_000;

/** 工具参数单字段最大长度 */
export const MAX_TOOL_ARG_LENGTH = 2_000;
