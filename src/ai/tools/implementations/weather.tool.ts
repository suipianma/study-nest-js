import { ConfigService } from '@nestjs/config';
import { ToolDefinition } from '../types/tool.type';

interface OpenWeatherResponse {
  name?: string;
  main?: { temp?: number };
  weather?: Array<{ description?: string }>;
}

interface WttrCurrentCondition {
  temp_C?: string;
  weatherDesc?: Array<{ value?: string }>;
}

interface WttrResponse {
  current_condition?: WttrCurrentCondition[];
  nearest_area?: Array<{
    areaName?: Array<{ value?: string }>;
  }>;
}

const WTTR_USER_AGENT = 'curl/8.0 (study-nest-js weather tool)';

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
        const openWeather = await fetchOpenWeather(city, apiKey);
        if (openWeather) return openWeather;
      }

      const wttr = await fetchWttrWeather(city);
      if (wttr) return wttr;

      return `${city} 天气查询失败，请稍后重试`;
    },
  };
}

async function fetchOpenWeather(
  city: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('q', city);
    url.searchParams.set('appid', apiKey);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('lang', 'zh_cn');

    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const data = (await res.json()) as OpenWeatherResponse;
    const name = data.name ?? city;
    const temp = data.main?.temp;
    const desc = data.weather?.[0]?.description ?? '未知';
    if (temp == null) return null;

    return `${name} ${Math.round(temp)}℃，${desc}`;
  } catch {
    return null;
  }
}

/** wttr.in 公共天气接口，无需 API Key */
async function fetchWttrWeather(city: string): Promise<string | null> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': WTTR_USER_AGENT,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as WttrResponse;
    const current = data.current_condition?.[0];
    if (!current?.temp_C) return null;

    const name =
      data.nearest_area?.[0]?.areaName?.[0]?.value?.trim() || city;
    const desc = current.weatherDesc?.[0]?.value?.trim() || '未知';
    return `${name} ${current.temp_C}℃，${desc}`;
  } catch {
    return null;
  }
}
