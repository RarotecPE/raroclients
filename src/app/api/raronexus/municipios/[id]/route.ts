import type { NextRequest } from "next/server";
import { getRaroNexusMunicipioDetalhe } from "@/lib/raronexus-municipios";
import {
  getRaroNexusSessionToken,
  raronexusMunicipiosErrorResponse,
  unauthorizedMunicipiosResponse,
} from "../../_session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getRaroNexusSessionToken(request);
  if (!token) return unauthorizedMunicipiosResponse(false);

  const { id } = await params;

  try {
    const data = await getRaroNexusMunicipioDetalhe(id, token);
    if (!data) return Response.json({ ok: false, error: "Municipio invalido." }, { status: 400 });
    return Response.json({ ok: true, data });
  } catch (error) {
    return raronexusMunicipiosErrorResponse(error, "Nao foi possivel consultar o municipio no RaroNexus.", false);
  }
}
