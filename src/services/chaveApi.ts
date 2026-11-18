// Geração das chaves de API (as do Friday, "fri_", e as do sistema, "sis_"): o texto é sorteado no navegador, mostrado
// uma vez e guardado só como SHA-256, que é o id do documento. As Functions acham a chave pelo mesmo hash (hashChave em
// functions/fridayApiDominio.ts). Sem Firebase aqui, para os testes rodarem em Node.
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Prefixo + 40 letras e números, sorteados pelo crypto do navegador. */
export function gerarChave(prefixo: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return `${prefixo}${Array.from(bytes, (b) => LETRAS[b % LETRAS.length]).join('')}`;
}

/** SHA-256 em hexadecimal minúsculo, como o createHash('sha256') das Functions. */
export async function sha256Hex(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Data local "AAAA-MM-DD HH:MM:SS", o formato das chaves e do último uso gravado pelas Functions. */
export function dataLocal(d = new Date()): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
}
