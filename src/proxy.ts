import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/redefinir-senha", "/instalacao", "/api/health"];

/**
 * Primeira barreira: sem cookie de sessão, qualquer rota protegida redireciona para o login.
 * A validação real da sessão e das permissões acontece no servidor, em lib/session.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!getSessionCookie(request, { cookiePrefix: "sigep" })) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
