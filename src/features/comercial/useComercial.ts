import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { editaArea } from '../../services/credenciais';
import { listFuncionariosAtivos } from '../../services/funcionarios-selecao.service';
import type { PessoaV2 } from '../../utils/cadastrosV2';
import { ouvirContatos, ouvirNegocios } from './comercialDados';
import type { Contato, Negocio } from './comercialDominio';

/** Negócios, contatos e pessoas ativas (para o responsável) das telas do Comercial, e se a pessoa edita a área. */
export function useComercial() {
  const { authorizationProfile } = useAuth();
  const podeEditar = editaArea(authorizationProfile, 'comercial');
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const [contatos, setContatos] = useState<Contato[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaV2[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const falhou = (qual: string) => (err: unknown) => {
      console.error(`Erro ao carregar ${qual} do Comercial`, err);
      setErro(`Não foi possível carregar ${qual}.`);
    };
    const pararNegocios = ouvirNegocios(setNegocios, falhou('os negócios'));
    const pararContatos = ouvirContatos(setContatos, falhou('os contatos'));
    listFuncionariosAtivos().then(setPessoas).catch(falhou('as pessoas'));
    return () => { pararNegocios(); pararContatos(); };
  }, []);

  const nomes = useMemo(() => Object.fromEntries(pessoas.map((p) => [p.uid, p.nome])), [pessoas]);
  return { negocios, contatos, pessoas, nomes, podeEditar, erro };
}
