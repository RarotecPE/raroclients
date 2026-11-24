import { FileClock, Mail, Plus, Search } from "lucide-react";
import Link from "next/link";
import { desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { propostas } from "@/db/schema";
import { Badge, Empty, Panel, PanelHeader, Stat, btnPrimary, inputCls, selectCls } from "@/components/ui";
import { PROPOSTA_SITUACOES, PROPOSTA_TIPOS, optLabel, optTone } from "@/lib/constants";
import { getCurrentSession } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const proposalGrid = "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]";

export default async function PropostasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; tipo?: string; solicitante?: string }>;
}) {
  const [params, rows, session] = await Promise.all([
    searchParams,
    db.select().from(propostas).where(isNull(propostas.excluidaAt)).orderBy(desc(propostas.createdAt)),
    getCurrentSession(),
  ]);
  const isGestor = session?.permissions.manage === true;
  const currentUserId = session?.user?.id;

  const visibleRows = isGestor
    ? rows
    : rows.filter((proposal) => proposal.solicitadoPorId && proposal.solicitadoPorId === currentUserId);

  const solicitantes = isGestor
    ? Array.from(
        new Set(
          rows
            .map((p) => p.solicitadoPorNome || p.solicitadoPorEmail)
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR"))
    : [];

  const query = (params.q ?? "").trim().toLocaleLowerCase("pt-BR");
  const filtered = visibleRows.filter((proposal) => {
    if (params.status && proposal.situacao !== params.status) return false;
    if (params.tipo && proposal.tipo !== params.tipo) return false;
    if (
      params.solicitante &&
      proposal.solicitadoPorNome !== params.solicitante &&
      proposal.solicitadoPorEmail !== params.solicitante
    ) {
      return false;
    }
    const searchableText = `${proposal.clienteNomeSnapshot} ${proposal.municipioNome} ${proposal.uf} ${proposal.solicitadoPorNome ?? ""}`;
    return !query || searchableText.toLocaleLowerCase("pt-BR").includes(query);
  });
  const count = (status: string) => visibleRows.filter((proposal) => proposal.situacao === status).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        {PROPOSTA_SITUACOES.map((status) => (
          <Stat key={status.value} label={status.label} value={count(status.value)} tone={status.tone} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PROPOSTA_TIPOS.map((type) => (
          <Stat
            key={type.value}
            label={type.label}
            value={visibleRows.filter((proposal) => proposal.tipo === type.value).length}
            tone={type.tone}
          />
        ))}
      </div>
      <Panel>
        <PanelHeader
          title="Central de propostas"
          description={
            isGestor
              ? "Solicitações, documentos, envios e decisões comerciais de todos os solicitantes"
              : "Minhas solicitações, documentos, envios e retornos comerciais"
          }
          right={
            <Link href="/propostas/nova" className={btnPrimary}>
              <Plus className="h-4 w-4" /> Solicitar proposta
            </Link>
          }
        />
        <form
          className={`grid gap-3 border-b border-app-border p-4 sm:grid-cols-2 ${
            isGestor
              ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              : "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          }`}
        >
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-app-muted-foreground" />
            <input name="q" defaultValue={params.q} placeholder="Cliente ou município" className={`${inputCls} pl-9`} />
          </div>
          <select name="status" defaultValue={params.status ?? ""} className={selectCls}>
            <option value="">Todos os status</option>
            {PROPOSTA_SITUACOES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={params.tipo ?? ""} className={selectCls}>
            <option value="">Todas as modalidades</option>
            {PROPOSTA_TIPOS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          {isGestor && solicitantes.length > 0 ? (
            <select name="solicitante" defaultValue={params.solicitante ?? ""} className={selectCls}>
              <option value="">Todos os solicitantes</option>
              {solicitantes.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : null}
          <button className={btnPrimary}>Filtrar</button>
        </form>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="p-5"><Empty title="Nenhuma proposta encontrada" /></div>
          ) : (
            <div className="min-w-[820px]">
              <div className={`${proposalGrid} border-b border-app-border`}>
                {["Cliente / município", "Modalidade", "Solicitada em", "Status", "Próxima ação"].map((heading) => (
                  <div key={heading} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-app-muted-foreground">
                    {heading}
                  </div>
                ))}
              </div>
              <div>
                {filtered.map((proposal) => (
                  <Link
                    key={proposal.id}
                    href={`/propostas/${proposal.id}`}
                    className={`${proposalGrid} border-b border-app-border transition-colors last:border-0 hover:bg-app-surface-elevated/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-primary`}
                    aria-label={`Abrir proposta de ${proposal.clienteNomeSnapshot}`}
                  >
                    <div className="px-4 py-3">
                      <p className="font-semibold text-app-foreground">{proposal.clienteNomeSnapshot}</p>
                      <p className="text-xs text-app-muted-foreground">{proposal.municipioNome}/{proposal.uf}</p>
                    </div>
                    <div className="px-4 py-3 text-sm text-app-muted-foreground">{optLabel(proposal.tipo)}</div>
                    <div className="px-4 py-3 text-sm text-app-muted-foreground">
                      <p>{formatDate(proposal.data)}</p>
                      {isGestor && proposal.solicitadoPorNome ? (
                        <p className="text-xs text-app-muted-foreground truncate" title={proposal.solicitadoPorNome}>
                          Por {proposal.solicitadoPorNome}
                        </p>
                      ) : null}
                    </div>
                    <div className="px-4 py-3">
                      <Badge tone={optTone(proposal.situacao)}>{optLabel(proposal.situacao)}</Badge>
                    </div>
                    <div className="px-4 py-3 text-xs text-app-muted-foreground">
                      {proposal.situacao === "solicitada" ? (
                        isGestor ? (
                          <><FileClock className="mr-1 inline h-3.5 w-3.5" />Anexar documento</>
                        ) : (
                          "Aguardando documento do gestor"
                        )
                      ) : proposal.situacao === "gerada" ? (
                        <><Mail className="mr-1 inline h-3.5 w-3.5" />Enviar ao cliente</>
                      ) : proposal.situacao === "em_retificacao" ? (
                        isGestor ? (
                          "Anexar nova versão"
                        ) : (
                          "Aguardando versão retificada"
                        )
                      ) : proposal.situacao === "cancelada" ? (
                        isGestor ? "Disponível para exclusão" : "Cancelada"
                      ) : (
                        "Acompanhar decisão"
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
