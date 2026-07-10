export interface IWeatherData {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  time: string;
  description: string;
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

export const getWeatherDescription = (code: number): string => {
  return WMO_CODES[code] || `Unknown (${code})`;
};

export const getWeather = async (latitude: number, longitude: number): Promise<IWeatherData | null> => {

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
    const response = await fetch(url);

    if (!response.ok)
      return null;

    const data = await response.json();

    if (!data.current_weather)
      return null;

    const cw = data.current_weather;

    return {
      temperature: cw.temperature,
      windspeed: cw.windspeed,
      winddirection: cw.winddirection,
      weathercode: cw.weathercode,
      time: cw.time,
      description: getWeatherDescription(cw.weathercode)
    };
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return null;
  }
};
