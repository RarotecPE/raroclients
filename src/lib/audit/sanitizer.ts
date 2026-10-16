const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /senha/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /credit[-_]?card/i,
  /cartao[-_]?credito/i,
  /cvv/i,
  /cvc/i,
  /private[-_]?key/i,
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /pin/i,
];

// Regex para mascaramento de texto livre
const CPF_REGEX = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g;
const CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Mascara CPFs preservando apenas parte intermediária para identificação segura.
 * Ex: 123.456.789-00 -> ***.456.789-**
 */
function maskCpf(text: string): string {
  return text.replace(CPF_REGEX, (_match, _p1, p2, p3) => `***.${p2}.${p3}-**`);
}

/**
 * Mascara números de cartão de crédito/débito preservando apenas os 4 últimos dígitos.
 * Ex: 4111 1111 1111 1234 -> **** **** **** 1234
 */
function maskCard(text: string): string {
  return text.replace(CARD_REGEX, match => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19) {
      const last4 = digits.slice(-4);
      return `**** **** **** ${last4}`;
    }
    return match;
  });
}

function sanitizeString(val: string): string {
  let res = maskCpf(val);
  res = maskCard(res);
  if (res.length > 4096) {
    res = res.slice(0, 4096) + '... [TRUNCATED]';
  }
  return res;
}

/**
 * Sanitiza recursivamente objetos e valores conforme diretrizes da LGPD (Art. 6º, III e Art. 5º, II).
 * - Substitui chaves sensíveis por "[REDACTED]"
 * - Mascara CPFs e números de cartão em campos de texto livre
 * - Impõe profundidade máxima para proteger memória (default: 3)
 */
export function sanitizeData(data: unknown, depth = 0, maxDepth = 3): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (data instanceof Date) {
    return isNaN(data.getTime()) ? null : data.toISOString();
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (typeof data === 'bigint') {
    return data.toString();
  }

  if (depth >= maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (Array.isArray(data)) {
    return data.slice(0, 50).map(item => sanitizeData(item, depth + 1, maxDepth));
  }

  if (typeof data === 'object') {
    const res: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
        res[key] = '[REDACTED]';
      } else {
        res[key] = sanitizeData(value, depth + 1, maxDepth);
      }
    }
    return res;
  }

  return String(data);
}

