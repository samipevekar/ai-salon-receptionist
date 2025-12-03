export async function GET() {
  return Response.json({
    env: process.env.DATABASE_URL ? "FOUND" : "NOT_FOUND",
    env2: process.env.DATABASE_URL,
    OPENMIC_API_KEY: process.env.OPENMIC_API_KEY ? "FOUND" : "NOT_FOUND"
  });
}
