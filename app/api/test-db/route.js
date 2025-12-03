export async function GET() {
  return Response.json({
    env: process.env.DATABASE_URL ? "FOUND" : "NOT_FOUND",
    OPENMIC_API_KEY: process.env.OPENMIC_API_KEY ? "FOUND" : "NOT_FOUND"
  });
}
