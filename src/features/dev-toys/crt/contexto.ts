import { createContext } from 'react';

/** Força do CRT (0 a 1) e movimento reduzido, vindos das preferências da área DEV. */
export const CrtContexto = createContext({ forca: 0.7, movimentoReduzido: false });
