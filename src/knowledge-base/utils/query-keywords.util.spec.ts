import { extractQueryKeywords, scoreKeywordMatch } from './query-keywords.util';

describe('query-keywords.util', () => {
  it('extractQueryKeywords 应去掉问句尾缀', () => {
    expect(extractQueryKeywords('聘用原则是什么')).toContain('聘用原则');
  });

  it('scoreKeywordMatch 命中关键词应高于未命中', () => {
    const hit = scoreKeywordMatch('公司聘用原则包括公开招聘', ['聘用原则']);
    const miss = scoreKeywordMatch('绩效考核中被调走', ['聘用原则']);
    expect(hit).toBeGreaterThan(miss);
  });
});
