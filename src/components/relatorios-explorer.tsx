"use client";

import { useState } from "react";
import { FileDown, Filter, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Dialog } from "@/components/dialog";
import {
  Badge,
  btnGhost,
  btnPrimary,
  btnSecondary,
  btnXs,
  inputCls,
  labelCls,
  selectCls,
} from "@/components/ui";
import {
  BASE_TIPOS,
  CONTRATO_MODALIDADES,
  CONTRATO_SITUACOES,
  DOCUMENTO_TIPOS,
  EVENTO_TIPOS,
  MODULE_CATALOG,
  MUNICIPIO_SITUACOES,
  PENDENCIA_TIPOS,
} from "@/lib/constants";
import { REPORTS, type ReportFilters, type ReportTipo } from "@/lib/reports/types";

interface ClienteOption {
  id: string;
  nome: string;
}

export function RelatoriosExplorer({
  clientes,
}: {
  clientes: ClienteOption[];
}) {
  const [globalClienteId, setGlobalClienteId] = useState("");
  const [globalSituacaoCliente, setGlobalSituacaoCliente] = useState("");
  const [globalDataInicio, setGlobalDataInicio] = useState("");
  const [globalDataFim, setGlobalDataFim] = useState("");

  const hasGlobalFilters = Boolean(
    globalClienteId || globalSituacaoCliente || globalDataInicio || globalDataFim,
  );

  const resetGlobalFilters = () => {
    setGlobalClienteId("");
    setGlobalSituacaoCliente("");
    setGlobalDataInicio("");
    setGlobalDataFim("");
  };

  const buildUrl = (tipo: ReportTipo, extraFilters: ReportFilters = {}) => {
    const params = new URLSearchParams();

    const merged: ReportFilters = {
      clienteId: extraFilters.clienteId !== undefined ? extraFilters.clienteId : globalClienteId,
      situacaoCliente: extraFilters.situacaoCliente !== undefined ? extraFilters.situacaoCliente : globalSituacaoCliente,
      dataInicio: extraFilters.dataInicio !== undefined ? extraFilters.dataInicio : globalDataInicio,
      dataFim: extraFilters.dataFim !== undefined ? extraFilters.dataFim : globalDataFim,
      modulo: extraFilters.modulo,
      modalidadeContrato: extraFilters.modalidadeContrato,
      situacaoContrato: extraFilters.situacaoContrato,
      situacaoPendencia: extraFilters.situacaoPendencia,
      tipoPendencia: extraFilters.tipoPendencia,
      tipoEvento: extraFilters.tipoEvento,
      tipoDocumento: extraFilters.tipoDocumento,
      tipoBase: extraFilters.tipoBase,
    };

    for (const [key, val] of Object.entries(merged)) {
      if (val) params.set(key, String(val));
    }

    const qs = params.toString();
    return `/api/relatorios/${tipo}/pdf${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      {/* Barra de Filtros Globais */}
      <div className="rounded-app-md border border-app-border bg-app-surface-elevated/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-app-primary" />
            <h2 className="text-sm font-semibold text-app-foreground">Filtros Gerais de Emissão</h2>
            {hasGlobalFilters && (
              <Badge tone="primary" className="text-[10px]">
                Filtros ativos
              </Badge>
            )}
          </div>
          {hasGlobalFilters && (
            <button
              type="button"
              onClick={resetGlobalFilters}
              className={btnXs}
              title="Limpar todos os filtros globais"
            >
              <RotateCcw className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Cliente / Município</span>
            <select
              className={selectCls}
              value={globalClienteId}
              onChange={(e) => setGlobalClienteId(e.target.value)}
            >
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Situação do Cliente</span>
            <select
              className={selectCls}
              value={globalSituacaoCliente}
              onChange={(e) => setGlobalSituacaoCliente(e.target.value)}
            >
              <option value="">Todas as situações</option>
              {MUNICIPIO_SITUACOES.map((sit) => (
                <option key={sit.value} value={sit.value}>
                  {sit.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Data início (referência)</span>
            <input
              type="date"
              className={inputCls}
              value={globalDataInicio}
              onChange={(e) => setGlobalDataInicio(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Data fim (referência)</span>
            <input
              type="date"
              className={inputCls}
              value={globalDataFim}
              onChange={(e) => setGlobalDataFim(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Grid de Relatórios */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => (
          <ReportCard
            key={report.tipo}
            report={report}
            clientes={clientes}
            globalUrl={buildUrl(report.tipo)}
            onBuildCustomUrl={(extra) => buildUrl(report.tipo, extra)}
            initialClienteId={globalClienteId}
            initialDataInicio={globalDataInicio}
            initialDataFim={globalDataFim}
          />
        ))}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  clientes,
  globalUrl,
  onBuildCustomUrl,
  initialClienteId,
  initialDataInicio,
  initialDataFim,
}: {
  report: (typeof REPORTS)[number];
  clientes: ClienteOption[];
  globalUrl: string;
  onBuildCustomUrl: (extra: ReportFilters) => string;
  initialClienteId: string;
  initialDataInicio: string;
  initialDataFim: string;
}) {
  const [customClienteId, setCustomClienteId] = useState(initialClienteId);
  const [customDataInicio, setCustomDataInicio] = useState(initialDataInicio);
  const [customDataFim, setCustomDataFim] = useState(initialDataFim);
  const [customModulo, setCustomModulo] = useState("");
  const [customModalidadeContrato, setCustomModalidadeContrato] = useState("");
  const [customSituacaoContrato, setCustomSituacaoContrato] = useState("");
  const [customSituacaoPendencia, setCustomSituacaoPendencia] = useState<"aberta" | "resolvida" | "todas">("aberta");
  const [customTipoPendencia, setCustomTipoPendencia] = useState("");
  const [customTipoEvento, setCustomTipoEvento] = useState("");
  const [customTipoDocumento, setCustomTipoDocumento] = useState("");
  const [customTipoBase, setCustomTipoBase] = useState("");

  const customUrl = onBuildCustomUrl({
    clienteId: customClienteId,
    dataInicio: customDataInicio,
    dataFim: customDataFim,
    modulo: customModulo || undefined,
    modalidadeContrato: customModalidadeContrato || undefined,
    situacaoContrato: customSituacaoContrato || undefined,
    situacaoPendencia: customSituacaoPendencia || undefined,
    tipoPendencia: customTipoPendencia || undefined,
    tipoEvento: customTipoEvento || undefined,
    tipoDocumento: customTipoDocumento || undefined,
    tipoBase: customTipoBase || undefined,
  });

  return (
    <div className="flex flex-col justify-between rounded-app-md border border-app-border bg-app-surface-elevated/40 p-3.5 transition-colors hover:border-app-muted-foreground/40">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 shrink-0 text-app-primary" />
            <h3 className="text-sm font-semibold text-app-foreground">{report.title}</h3>
          </div>
        </div>
        <p className="mt-1 text-xs text-app-muted-foreground leading-relaxed">{report.description}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-app-border/60 pt-3">
        <a
          href={globalUrl}
          target="_blank"
          rel="noreferrer"
          className={btnPrimary}
        >
          <FileDown className="h-4 w-4" />
          Gerar PDF
        </a>

        <Dialog
          title={`Filtros: ${report.title}`}
          description="Personalize os parâmetros específicos para a emissão deste relatório."
          trigger={
            <button
              type="button"
              className={btnSecondary}
              title="Personalizar filtros deste relatório"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Opções
            </button>
          }
        >
          <div className="flex flex-col gap-3 py-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Cliente / Município</span>
              <select
                className={selectCls}
                value={customClienteId}
                onChange={(e) => setCustomClienteId(e.target.value)}
              >
                <option value="">Todos os clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>

            {/* Módulo (para relatórios de módulo/implantação/responsáveis) */}
            {(report.tipo === "mapa-implantacao" ||
              report.tipo === "modulos-sem-contrato" ||
              report.tipo === "modulos-nao-habilitados" ||
              report.tipo === "responsaveis-modulos" ||
              report.tipo === "oportunidades-comerciais") && (
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Módulo do Catálogo</span>
                <select
                  className={selectCls}
                  value={customModulo}
                  onChange={(e) => setCustomModulo(e.target.value)}
                >
                  <option value="">Todos os módulos</option>
                  {MODULE_CATALOG.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Contratos */}
            {report.tipo === "contratos-cobertura" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Modalidade do Contrato</span>
                  <select
                    className={selectCls}
                    value={customModalidadeContrato}
                    onChange={(e) => setCustomModalidadeContrato(e.target.value)}
                  >
                    <option value="">Todas as modalidades</option>
                    {CONTRATO_MODALIDADES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Situação do Contrato</span>
                  <select
                    className={selectCls}
                    value={customSituacaoContrato}
                    onChange={(e) => setCustomSituacaoContrato(e.target.value)}
                  >
                    <option value="">Todas as situações</option>
                    {CONTRATO_SITUACOES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {/* Pendências */}
            {report.tipo === "pendencias-clientes" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Situação da Pendência</span>
                  <select
                    className={selectCls}
                    value={customSituacaoPendencia}
                    onChange={(e) => setCustomSituacaoPendencia(e.target.value as "aberta" | "resolvida" | "todas")}
                  >
                    <option value="aberta">Apenas Abertas</option>
                    <option value="resolvida">Apenas Resolvidas</option>
                    <option value="todas">Todas (Abertas e Resolvidas)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Tipo de Pendência</span>
                  <select
                    className={selectCls}
                    value={customTipoPendencia}
                    onChange={(e) => setCustomTipoPendencia(e.target.value)}
                  >
                    <option value="">Todos os tipos</option>
                    {Object.entries(PENDENCIA_TIPOS).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {/* Histórico */}
            {report.tipo === "historico-clientes" && (
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Tipo de Evento</span>
                <select
                  className={selectCls}
                  value={customTipoEvento}
                  onChange={(e) => setCustomTipoEvento(e.target.value)}
                >
                  <option value="">Todos os eventos</option>
                  {Object.entries(EVENTO_TIPOS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Documentos */}
            {report.tipo === "documentos-clientes" && (
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Tipo de Documento</span>
                <select
                  className={selectCls}
                  value={customTipoDocumento}
                  onChange={(e) => setCustomTipoDocumento(e.target.value)}
                >
                  <option value="">Todos os tipos</option>
                  {DOCUMENTO_TIPOS.map((doc) => (
                    <option key={doc.value} value={doc.value}>
                      {doc.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Bases incompletas */}
            {report.tipo === "bases-incompletas" && (
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Tipo de Base</span>
                <select
                  className={selectCls}
                  value={customTipoBase}
                  onChange={(e) => setCustomTipoBase(e.target.value)}
                >
                  <option value="">Todos os tipos</option>
                  {BASE_TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Período */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>De</span>
                <input
                  type="date"
                  className={inputCls}
                  value={customDataInicio}
                  onChange={(e) => setCustomDataInicio(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Até</span>
                <input
                  type="date"
                  className={inputCls}
                  value={customDataFim}
                  onChange={(e) => setCustomDataFim(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-app-border pt-3">
              <a
                href={customUrl}
                target="_blank"
                rel="noreferrer"
                className={btnPrimary}
              >
                <FileDown className="h-4 w-4" />
                Gerar PDF com Filtros
              </a>
            </div>
          </div>
        </Dialog>
      </div>
    </div>
  );
}
