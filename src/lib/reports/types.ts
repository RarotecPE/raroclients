export const REPORTS = [
  { tipo: "resumo-executivo", title: "Resumo executivo", description: "Totais gerais de clientes, contratos, módulos e pendências." },
  { tipo: "ficha-clientes", title: "Ficha completa dos clientes", description: "Cadastro, bases, módulos, contratos, responsáveis e pendências." },
  { tipo: "mapa-implantacao", title: "Mapa de implantação", description: "Status operacional dos módulos por cliente e base." },
  { tipo: "contratos-cobertura", title: "Cobertura dos contratos", description: "Contratos, clientes, bases e módulos contemplados." },
  { tipo: "pendencias-clientes", title: "Pendências por cliente", description: "Pendências abertas e resolvidas agrupadas por cliente." },
  { tipo: "modulos-sem-contrato", title: "Módulos habilitados sem contrato", description: "Riscos administrativos por falta de formalização." },
  { tipo: "modulos-nao-habilitados", title: "Módulos contratados não habilitados", description: "Itens contratados pendentes de habilitação." },
  { tipo: "responsaveis-modulos", title: "Responsáveis por módulo", description: "Contatos vinculados a cliente, base e módulo." },
  { tipo: "bases-incompletas", title: "Bases incompletas", description: "Bases sem CNPJ ou com dados críticos ausentes." },
  { tipo: "historico-clientes", title: "Histórico dos clientes", description: "Linha do tempo de eventos dos clientes." },
  { tipo: "oportunidades-comerciais", title: "Oportunidades comerciais", description: "Módulos do catálogo ainda não cadastrados por cliente." },
  { tipo: "documentos-clientes", title: "Documentos por cliente", description: "Arquivos de clientes, contratos e propostas, inclusive documentos históricos." },
] as const;

export type ReportTipo = (typeof REPORTS)[number]["tipo"];

export interface ReportFilters {
  clienteId?: string;
  situacaoCliente?: string;
  modulo?: string;
  modalidadeContrato?: string;
  situacaoContrato?: string;
  situacaoPendencia?: "aberta" | "resolvida" | "todas";
  tipoPendencia?: string;
  tipoEvento?: string;
  tipoDocumento?: string;
  tipoBase?: string;
  dataInicio?: string;
  dataFim?: string;
}

export type ReportSection = {
  title: string;
  rows: string[][];
  headers?: string[];
  empty?: string;
};
