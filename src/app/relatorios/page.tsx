import { asc } from "drizzle-orm";
import { db } from "@/db";
import { municipios } from "@/db/schema";
import { Panel, PanelHeader } from "@/components/ui";
import { RelatoriosExplorer } from "@/components/relatorios-explorer";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const clientes = await db
    .select({
      id: municipios.id,
      nome: municipios.clienteNome,
    })
    .from(municipios)
    .orderBy(asc(municipios.clienteNome));

  return (
    <Panel>
      <PanelHeader
        title="Relatórios impressos"
        description="PDFs consolidados para reuniões, acompanhamento e arquivo com filtros contextuais"
      />
      <RelatoriosExplorer clientes={clientes} />
    </Panel>
  );
}
