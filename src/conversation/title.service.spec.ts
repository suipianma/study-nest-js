import { pickConversationTitle } from './title.service';

describe('pickConversationTitle', () => {
  const fallback = 'NestJS 有哪些核心概念？';

  it('应接受正常短标题', () => {
    expect(pickConversationTitle('NestJS 核心概念', fallback)).toBe(
      'NestJS 核心概念',
    );
  });

  it('应拒绝复述任务指令的标题并回退', () => {
    expect(
      pickConversationTitle(
        '嗯，用户让我生成一个不超过20字的标题',
        fallback,
      ),
    ).toBe(fallback);
  });

  it('应从多行输出中取有效标题行', () => {
    expect(
      pickConversationTitle('思考中...\nPath Router 简介', fallback),
    ).toBe('Path Router 简介');
  });

  it('应去掉标题前缀与引号', () => {
    expect(pickConversationTitle('标题：JWT 鉴权机制', fallback)).toBe(
      'JWT 鉴权机制',
    );
  });
});
