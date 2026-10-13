// Single source for the Components Map diagram. COMPONENTS_MAP.md embeds the same text (a test keeps them in sync).
export const COMPONENTS_MERMAID = `flowchart TB
  subgraph Triggers
    VC["Vercel Cron (UTC)<br/>snapshot daily 21:30<br/>weekly Sat 23:30<br/>watchdog Sun 04:00"]
    GHA["GitHub Actions<br/>backup weekly trigger"]
    ADM["Admin /settings<br/>Generate brief now"]
  end

  subgraph Vercel["Next.js on Vercel (Node.js functions, max 300s)"]
    CRON["/api/cron/* routes<br/>CRON_SECRET bearer"]
    MAN["POST /api/runs/manual<br/>1 run / 30 min"]
    STEP["POST /api/pipeline/step<br/>runner: claim stage, run, after() self-trigger"]
    subgraph Pipeline["Checkpointed state machine (one stage per invocation)"]
      direction LR
      COLLECT --> ENRICH --> SCORE --> CLUSTER --> STAGE --> SYNTHESIZE --> VALIDATE --> RENDER --> DELIVER
    end
    WEB["Web app<br/>momentum board · trend slider · your plan<br/>/ · /briefs · /runs · /architecture · /settings"]
    FB["GET /api/feedback<br/>HMAC-signed links"]
    HEALTH["GET /api/health"]
    CHAT["Idea Studio<br/>POST /api/chat (streaming) · /api/chat/summary"]
  end

  subgraph Guardrails
    QM["Quota manager<br/>per-run unit budget"]
    INJ["Injection framing<br/>untrusted data blocks"]
    VAL["Validator<br/>zod · evidence IDs · no invented numbers"]
    WD["Watchdog<br/>fallback brief"]
  end

  subgraph Data["Neon Postgres (Drizzle)"]
    T1[("settings · channels · videos<br/>video_snapshots · enrichments")]
    T2[("runs · stage_outputs<br/>clusters · briefs · feedback")]
  end

  YT["YouTube Data API v3"]
  GEM["Gemini Flash<br/>@google/genai"]
  RS["Resend email"]
  TG["Telegram alerts"]
  USER(["Ishaan: swipes trends, decides<br/>web + email + Telegram"])

  VC --> CRON
  GHA --> CRON
  ADM --> MAN
  CRON --> STEP
  MAN --> STEP
  STEP --> Pipeline
  STEP <--> T2
  COLLECT --> QM --> YT
  COLLECT --> T1
  ENRICH --> INJ --> GEM
  SYNTHESIZE --> INJ
  VALIDATE --> VAL
  ENRICH --> T1
  CLUSTER --> T2
  RENDER --> T2
  DELIVER --> RS
  DELIVER --> TG
  CRON --> WD --> T2
  WD --> TG
  WEB --> T2
  FB --> T2
  RS --> USER
  WEB --> USER
  WEB --> CHAT
  CHAT --> GEM
  CHAT --> RS
  CHAT --> TG`;
