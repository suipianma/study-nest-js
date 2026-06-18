/** 小推理模型常见：正文为空/极短，有效内容在 thinking */
export function resolveModelReply(
  thinking: string,
  response: string,
): { thinking: string; response: string } {
  const t = thinking.trim();
  const r = response.trim();

  if (!t) {
    return { thinking: '', response: r };
  }

  if (!r) {
    return { thinking: '', response: t };
  }

  // 正文过短而思考链有实质内容（小推理模型常见）
  if (r.length < 40 && t.length > 60) {
    return { thinking: '', response: t };
  }

  if (r.length < 40 && t.length > r.length * 2) {
    return { thinking: '', response: t };
  }

  return { thinking: t, response: r };
}
