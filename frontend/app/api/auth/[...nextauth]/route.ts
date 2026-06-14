// NextAuth removed — authentication is now handled by Supabase.
// The /api/auth/callback route in app/api/auth/callback/route.ts handles OAuth.
export async function GET() {
  return new Response("Not found", { status: 404 });
}
export async function POST() {
  return new Response("Not found", { status: 404 });
}
