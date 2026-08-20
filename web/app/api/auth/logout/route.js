import { cookies } from 'next/headers';

export async function GET(request) {
  const cookieStore = await cookies();
  cookieStore.delete('session');
  return Response.redirect(new URL('/', request.url));
}
