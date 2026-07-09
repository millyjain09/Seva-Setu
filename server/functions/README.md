# Edge functions index

Real code: [`../../supabase/functions/`](../../supabase/functions/)

| Function                 | Purpose                                              | Secrets used                                        |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| `chat`                   | AI conversation (Gemini via Lovable AI Gateway)      | `LOVABLE_API_KEY`                                   |
| `analyze-report`         | OCR + AI analysis of uploaded health reports         | `LOVABLE_API_KEY`                                   |
| `check-eligibility`      | Match user profile against gov schemes               | `LOVABLE_API_KEY`                                   |
| `refresh-schemes`        | Pull latest schemes from data.gov.in                 | `DATA_GOV_IN_API_KEY`                               |
| `weather-health-tip`     | Live weather + AI daily health tip                   | `OPENWEATHER_API_KEY`, `LOVABLE_API_KEY`            |
| `send-daily-tip`         | Scheduled push of the weather-aware daily tip        | `OPENWEATHER_API_KEY`, `LOVABLE_API_KEY`, `VAPID_*` |
| `daily-health-reminders` | Scheduled reminder fan-out                           | `VAPID_*`                                           |
| `send-push`              | Web Push delivery (VAPID)                            | `VAPID_*`, `SUPABASE_SERVICE_ROLE_KEY`              |
| `otp-throttle`           | Server-side OTP rate limiting / attempt lockout      | `SUPABASE_SERVICE_ROLE_KEY`                         |

Called from the client with `supabase.functions.invoke("<name>", { body })`.