// Boot falso do /dev: o texto (sem acento, por causa da Monaco) e a regra de quando ele aparece. Sem DOM, testável.
// Só dados não sensíveis: nada de e-mail, uid, token ou variável de ambiente além do modo do build.

export type EstadoBoot = { modo: string; online: boolean; serviceWorker: boolean };

export function linhasBoot({ modo, online, serviceWorker }: EstadoBoot): string[] {
  return [
    'LEDUR MOTORISTA WEB   BIOS v0.1  (C) 2026',
    '',
    'MEMORY TEST ........ 640K OK',
    `BUILD .............. ${modo.toUpperCase()}`,
    `NETWORK ............ ${online ? 'ONLINE' : 'OFFLINE'}`,
    `PWA ................ ${serviceWorker ? 'SERVICE WORKER OK' : 'SEM SERVICE WORKER'}`,
    'LOADING FLEET.SYS ... OK',
    'LOADING CRAWLER.DRV . OK',
    '',
    'STARTING DESKTOP ...',
  ];
}

export const CHAVE_BOOT_VISTO = 'ledur:dev-boot-visto';

/** O boot aparece uma vez por sessão do navegador, ou sempre, se a preferência pedir. */
export function deveMostrarBoot(bootSempre: boolean, sessao: Pick<Storage, 'getItem'> | null): boolean {
  if (bootSempre) return true;
  try {
    return sessao?.getItem(CHAVE_BOOT_VISTO) !== '1';
  } catch {
    return true;
  }
}
