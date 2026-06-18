import { ConfigService } from '@nestjs/config';
import { createWeatherTool } from './weather.tool';

describe('createWeatherTool', () => {
  it('mock 模式应返回含城市名的天气', async () => {
    const config = {
      get: () => undefined,
    } as ConfigService;
    const tool = createWeatherTool(config);
    const result = await tool.execute({ city: '武汉' });
    expect(result).toContain('武汉');
    expect(result).toContain('模拟数据');
  });

  it('缺少 city 应抛错', async () => {
    const config = { get: () => undefined } as ConfigService;
    const tool = createWeatherTool(config);
    await expect(tool.execute({})).rejects.toThrow('缺少参数 city');
  });
});
