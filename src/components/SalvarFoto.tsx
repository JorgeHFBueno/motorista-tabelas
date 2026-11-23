import { Button } from '@mui/material';
import { useEffect, useState } from 'react';
import { arquivoDaFoto } from '../services/checklists.service';

/** "Salvar foto": baixa a original e abre o menu de compartilhar (no iPhone, "Salvar imagem"); sem ele, baixa o arquivo.
 * A foto é baixada ao abrir, porque o iPhone só abre o menu logo depois do toque. Sem o download, fica "Abrir original". */
export default function SalvarFoto({ path, titulo }: { path: string; titulo: string }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let active = true;
    arquivoDaFoto(path).then((f) => active && setArquivo(f)).catch((error) => {
      console.warn('Checklist: foto não baixada para salvar', error);
      if (active) setFalhou(true);
    });
    return () => { active = false; };
  }, [path]);
  if (falhou) return null;
  const salvar = () => {
    if (!arquivo) return;
    if (navigator.canShare?.({ files: [arquivo] })) {
      navigator.share({ files: [arquivo], title: titulo }).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    const link = Object.assign(document.createElement('a'), { href: url, download: arquivo.name });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Button variant="contained" disabled={!arquivo} onClick={salvar}>{arquivo ? 'Salvar foto' : 'Preparando foto...'}</Button>;
}
