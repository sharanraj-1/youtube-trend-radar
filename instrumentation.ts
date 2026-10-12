// Validates environment variables once at server boot. Logs names only, never values.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { envReport } = await import("./lib/env");
  const r = envReport();
  if (!r.valid) console.error(JSON.stringify({ level: "error", msg: "invalid environment configuration", problems: r.problems }));
  else console.log(JSON.stringify({ level: "info", msg: "environment validated", optional: r.optional }));
}
