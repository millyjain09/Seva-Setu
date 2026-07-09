import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { withErrorCapture } from "../_shared/error-capture.ts";

interface Body { lat?: number; lon?: number; lang?: string }

Deno.serve(withErrorCapture("weather-health-tip", async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { lat, lon, lang = 'English' }: Body = await req.json().catch(() => ({}));
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return new Response(JSON.stringify({ error: 'lat and lon required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch current + 12h forecast from OpenWeatherMap
    const OWM_KEY = Deno.env.get('OPENWEATHER_API_KEY');
    if (!OWM_KEY) throw new Error('OPENWEATHER_API_KEY not configured');

    const curUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}`;
    const fcUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=4&appid=${OWM_KEY}`;
    const [curRes, fcRes] = await Promise.all([fetch(curUrl), fetch(fcUrl)]);
    if (!curRes.ok) throw new Error(`OWM current ${curRes.status}: ${await curRes.text()}`);
    const cur = await curRes.json();
    const fc = fcRes.ok ? await fcRes.json() : { list: [] };

    const weather = {
      temperature: cur.main?.temp,
      feels_like: cur.main?.feels_like,
      humidity: cur.main?.humidity,
      wind: Math.round((cur.wind?.speed ?? 0) * 3.6), // m/s -> km/h
      precipitation: (cur.rain?.['1h'] ?? 0) + (cur.snow?.['1h'] ?? 0),
      condition: cur.weather?.[0]?.description ?? 'current weather',
    };

    const forecast = (fc.list || []).map((f: any) => ({
      time: f.dt_txt,
      temp: f.main?.temp,
      condition: f.weather?.[0]?.description ?? '',
      pop: Math.round((f.pop ?? 0) * 100),
      rain: f.rain?.['3h'] ?? 0,
    }));

    // Ask Gemini via Lovable AI Gateway for a contextual tip
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    const forecastBlock = forecast.length
      ? `Next 12 hours forecast:\n${forecast.map((f: any) => `- ${f.time}: ${f.condition}, ${Math.round(f.temp)}°C, rain chance ${f.pop}%`).join('\n')}`
      : '';

    const prompt = `You are a rural health advisor for India. Generate ONE short, actionable daily health tip (max 22 words) tailored to these live conditions:
- Time: ${partOfDay}
- Weather: ${weather.condition}
- Temperature: ${weather.temperature}°C (feels ${weather.feels_like}°C)
- Humidity: ${weather.humidity}%
- Wind: ${weather.wind} km/h
- Precipitation: ${weather.precipitation} mm
${forecastBlock}

Use the forecast to anticipate (e.g. warn of incoming rain, heat spike, etc.) if relevant. Reply ONLY as compact JSON: {"emoji":"<one emoji>","tip":"<the tip in ${lang}>"}. No markdown, no extra text.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${txt}`);
    }
    const ai = await aiRes.json();
    const raw: string = ai.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let tip = { emoji: '💡', tip: 'Stay hydrated and listen to your body today.' };
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed?.tip) tip = { emoji: parsed.emoji || '💡', tip: parsed.tip };
    } catch {
      if (cleaned) tip.tip = cleaned.slice(0, 200);
    }

    return new Response(JSON.stringify({ weather, forecast, tip, generated_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
