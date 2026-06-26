import { BadRequestException } from '@nestjs/common';
import { parseKnowledgeBaseIds } from './parse-knowledge-base-ids.util';

describe('parseKnowledgeBaseIds', () => {
  it('undefined 应返回 undefined', () => {
    expect(parseKnowledgeBaseIds(undefined)).toBeUndefined();
  });

  it('应解析逗号分隔 ID', () => {
    expect(parseKnowledgeBaseIds('1,2,3')).toEqual([1, 2, 3]);
  });

  it('应解析 JSON 数组字符串', () => {
    expect(parseKnowledgeBaseIds('[4,5]')).toEqual([4, 5]);
  });

  it('应去重', () => {
    expect(parseKnowledgeBaseIds('1,1,2')).toEqual([1, 2]);
  });

  it('非法 ID 应抛 BadRequestException', () => {
    expect(() => parseKnowledgeBaseIds('0,-1,abc')).toThrow(BadRequestException);
  });
});
