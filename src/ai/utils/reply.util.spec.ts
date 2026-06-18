import { resolveModelReply } from './reply.util';

describe('resolveModelReply', () => {
  it('正文充足时保留 thinking 与 response 分离', () => {
    const result = resolveModelReply('内心独白', '这是一段足够长的正式回答内容，超过四十个字符');
    expect(result.thinking).toBe('内心独白');
    expect(result.response).toContain('正式回答');
  });

  it('正文过短且 thinking 更长时，用 thinking 作为正文', () => {
    const thinking =
      '这是很长的思考过程，包含面试题设计思路与具体内容，需要超过六十个字符才触发兜底逻辑';
    const result = resolveModelReply(thinking, '【前端面试官】React 优势');
    expect(result.thinking).toBe('');
    expect(result.response).toBe(thinking);
  });

  it('无 thinking 时原样返回 response', () => {
    const result = resolveModelReply('', '简短回复');
    expect(result).toEqual({ thinking: '', response: '简短回复' });
  });
});
