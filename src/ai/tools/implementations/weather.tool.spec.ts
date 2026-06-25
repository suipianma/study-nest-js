import { ConfigService } from '@nestjs/config';
import { createWeatherTool } from './weather.tool';

describe('createWeatherTool', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('应优先使用 OpenWeather（已配置 Key）', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Wuhan',
        main: { temp: 31.2 },
        weather: [{ description: '晴' }],
      }),
    }) as unknown as typeof fetch;

    const config = {
      get: (key: string) => (key === 'WEATHER_API_KEY' ? 'test-key' : undefined),
    } as ConfigService;
    const tool = createWeatherTool(config);
    const result = await tool.execute({ city: '武汉' });

    expect(result).toBe('Wuhan 31℃，晴');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain(
      'openweathermap.org',
    );
  });

  it('无 Key 时应使用 wttr.in 返回真实天气', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current_condition: [{ temp_C: '28', weatherDesc: [{ value: '多云' }] }],
        nearest_area: [{ areaName: [{ value: 'Wuhan' }] }],
      }),
    }) as unknown as typeof fetch;

    const config = { get: () => undefined } as ConfigService;
    const tool = createWeatherTool(config);
    const result = await tool.execute({ city: '武汉' });

    expect(result).toBe('Wuhan 28℃，多云');
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain(
      'wttr.in',
    );
  });

  it('全部失败时应返回友好错误', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    const config = { get: () => undefined } as ConfigService;
    const tool = createWeatherTool(config);
    const result = await tool.execute({ city: '武汉' });

    expect(result).toContain('天气查询失败');
  });

  it('缺少 city 应抛错', async () => {
    const config = { get: () => undefined } as ConfigService;
    const tool = createWeatherTool(config);
    await expect(tool.execute({})).rejects.toThrow('缺少参数 city');
  });
});
