import { ChunkService } from './chunk.service';

describe('ChunkService', () => {
  let service: ChunkService;

  beforeEach(() => {
    service = new ChunkService();
  });

  it('split 应按 size 切分文本', () => {
    const text = 'a'.repeat(500);
    const chunks = service.split(text, { size: 200, overlap: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks.every((c) => c.content.length <= 200)).toBe(true);
  });

  it('split 应支持 overlap', () => {
    const text = 'a'.repeat(500);
    const chunks = service.split(text, { size: 200, overlap: 40 });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('应按段落边界切分，章节标题单独成段', () => {
    const text = '第一章 总则\n这是总则内容。\n\n第二章 聘用\n聘用相关条款。';
    const chunks = service.split(text, { size: 200, overlap: 0 });

    expect(chunks.some((c) => c.content.includes('第一章'))).toBe(true);
    expect(chunks.some((c) => c.content.includes('聘用'))).toBe(true);
  });

  it('空文本应返回空数组', () => {
    expect(service.split('   ')).toEqual([]);
  });
});
