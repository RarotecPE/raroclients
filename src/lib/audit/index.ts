export * from './types';
export * from './uuid';
export * from './sanitizer';
export * from './tokens';
export * from './hash';
export * from './queue';
export * from './client';

/**
 * Extrai IP e User-Agent de um Request HTTP de forma segura (Route Handlers).
 */
export function getRequestContext(request?: Request | null): { ip: string | null; userAgent: string | null } {
  if (!request) {
    return { ip: null, userAgent: null };
  }
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : null;
  const userAgent = request.headers.get('user-agent');
  return { ip, userAgent };
}

/**
 * Extrai IP e User-Agent a partir de headers() em Server Actions do Next.js.
 */
export async function getActionRequestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const { headers } = await import('next/headers');
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : headerList.get('x-real-ip') || null;
    const userAgent = headerList.get('user-agent') || null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export function sessionToAuditActor(session: { user: { id?: string; nome?: string; email?: string }; role?: string | null }): import('./types').AuditActor {
  return {
    type: 'user',
    userId: session.user.id || undefined,
    name: session.user.nome || 'Usuário',
    email: session.user.email || undefined,
    role: typeof session.role === 'string' ? session.role : null,
  };
}

