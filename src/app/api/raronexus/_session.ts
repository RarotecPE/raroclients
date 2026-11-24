import type { NextRequest } from "next/server";
import { getRaroNexusConfig, getSessionFromRequest } from "@/lib/auth";
import { RaroNexusMunicipiosError } from "@/lib/raronexus-municipios";

export async function getRaroNexusSessionToken(request: NextRequest): Promise<string | null> {
  const config = getRaroNexusConfig(request);
  const token = request.cookies.get(config.cookies.session)?.value?.trim();
  if (!token) return null;

  const session = await getSessionFromRequest(request);
  if (!session) return null;

  return token;
}

export function unauthorizedMunicipiosResponse(includeEmptyData: boolean) {
  if (includeEmptyData) {
    return Response.json({ ok: false, data: [], error: "Sessao nao encontrada." }, { status: 401 });
  }
  return Response.json({ ok: false, error: "Sessao nao encontrada." }, { status: 401 });
}

export function raronexusMunicipiosErrorResponse(
  error: unknown,
  fallbackMessage: string,
  includeEmptyData: boolean,
) {
  const status = error instanceof RaroNexusMunicipiosError && error.status === 401 ? 401 : 502;
  const message =
    status === 401
      ? "Sessao expirada. Entre novamente pelo RaroNexus."
      : fallbackMessage;

  if (includeEmptyData) {
    return Response.json({ ok: false, data: [], error: message }, { status });
  }
  return Response.json({ ok: false, error: message }, { status });
}
