import { createContext } from 'react';
import type { Pessoa } from '../api.ts';

// Quem tem acesso ao quadro aberto (dado pela QuadroPage, ver pessoasDoQuadro): é a lista de escolha das colunas
// "Colaboradores". Fora de um quadro (null), a coluna oferece todas as pessoas.
export const ColaboradoresDoQuadro = createContext<Pessoa[] | null>(null);
