import { ConfigService } from '@nestjs/config';
import { ToolDefinition } from '../types/tool.type';

interface OpenWeatherResponse {
  name?: string;
  main?: { temp?: number };
  weather?: Array<{ description?: string }>;
}

export function createWeatherTool(config: ConfigService): ToolDefinition {
  return {
    name: 'weather',
    description: '查询城市天气',
    parameters: [
      { name: 'city', description: '城市名，如「武汉」', required: true },
    ],
    execute: async (args) => {
      const city = args.city?.trim();
      if (!city) {
        throw new Error('缺少参数 city');
      }

      const apiKey = config.get<string>('WEATHER_API_KEY')?.trim();
      if (apiKey) {
        try {
          const url = new URL('https://api.openweathermap.org/data/2.5/weather');
          url.searchParams.set('q', city);
          url.searchParams.set('appid', apiKey);
          url.searchParams.set('units', 'metric');
          url.searchParams.set('lang', 'zh_cn');

          const res = await fetch(url, {
            signal: AbortSignal.timeout(8_000),
          });
          if (res.ok) {
            const data = (await res.json()) as OpenWeatherResponse;
            const name = data.name ?? city;
            const temp = data.main?.temp;
            const desc = data.weather?.[0]?.description ?? '未知';
            if (temp != null) {
              return `${name} ${Math.round(temp)}℃，${desc}`;
            }
          }
        } catch {
          // 真实 API 失败时降级 mock
        }
      }

      return `${city} 26℃，多云（模拟数据）`;
    },
  };
}
