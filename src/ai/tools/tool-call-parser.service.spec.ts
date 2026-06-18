import { Test, TestingModule } from '@nestjs/testing';
import { ToolCallParserService } from './tool-call-parser.service';

describe('ToolCallParserService', () => {
  let service: ToolCallParserService;
  const known = new Set(['weather']);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolCallParserService],
    }).compile();

    service = module.get(ToolCallParserService);
  });

  it('应解析纯 JSON 工具调用', () => {
    const result = service.parse('{"tool":"weather","city":"武汉"}', known);
    expect(result).toEqual({
      tool: 'weather',
      args: { city: '武汉' },
      raw: '{"tool":"weather","city":"武汉"}',
    });
  });

  it('应跳过 think 标签后解析', () => {
    const result = service.parse(
      '思考中...{"tool":"weather","city":"北京"}',
      known,
    );
    expect(result?.tool).toBe('weather');
    expect(result?.args.city).toBe('北京');
  });

  it('应解析代码块中的 JSON', () => {
    const result = service.parse(
      '```json\n{"tool":"weather","city":"上海"}\n```',
      known,
    );
    expect(result?.args.city).toBe('上海');
  });

  it('非 JSON 文本应返回 null', () => {
    expect(service.parse('你好，我是助手', known)).toBeNull();
  });

  it('未知工具应返回 null', () => {
    expect(service.parse('{"tool":"unknown","x":"1"}', known)).toBeNull();
  });
});
