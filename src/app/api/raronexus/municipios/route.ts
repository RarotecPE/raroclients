import type { NextRequest } from "next/server";
import { getRaroNexusMunicipiosByUf } from "@/lib/raronexus-municipios";
import {
  getRaroNexusSessionToken,
  raronexusMunicipiosErrorResponse,
  unauthorizedMunicipiosResponse,
} from "../_session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = await getRaroNexusSessionToken(request);
  if (!token) return unauthorizedMunicipiosResponse(true);

  const uf = request.nextUrl.searchParams.get("uf") ?? "";

  try {
    return Response.json({ ok: true, data: await getRaroNexusMunicipiosByUf(uf, token) });
  } catch (error) {
    return raronexusMunicipiosErrorResponse(error, "Nao foi possivel consultar os municipios no RaroNexus.", true);
  }
}
