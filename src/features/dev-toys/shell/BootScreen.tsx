import { useEffect, useMemo, useRef, useState } from 'react';
import useOnlineStatus from '../../../hooks/useOnlineStatus';
import { linhasBoot } from '../boot';

const MS_POR_CHAR = 18;
const MS_FIM_DE_LINHA = 140;
const MS_DEPOIS_DO_TEXTO = 600;

const movimentoReduzido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

// Boot falso: digita as linhas com cursor piscando; qualquer tecla ou clique pula. Com movimento reduzido,
// o texto aparece inteiro, sem digitação.
export default function BootScreen({ onFim }: { onFim: () => void }) {
  const { isOnline } = useOnlineStatus();
  // O texto é montado uma vez: o estado da rede no meio da digitação não reescreve a tela.
  const texto = useMemo(
    () => linhasBoot({ modo: import.meta.env.MODE, online: isOnline, serviceWorker: Boolean(navigator.serviceWorker?.controller) }).join('\n'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [digitados, setDigitados] = useState(() => (movimentoReduzido() ? texto.length : 0));
  const fim = useRef(onFim);
  useEffect(() => { fim.current = onFim; }, [onFim]);

  // Digitação: um caractere por vez, com pausa no fim de cada linha; depois do texto, segue para o Desktop.
  useEffect(() => {
    if (digitados >= texto.length) {
      const t = window.setTimeout(() => fim.current(), MS_DEPOIS_DO_TEXTO);
      return () => window.clearTimeout(t);
    }
    const atraso = texto[digitados] === '\n' ? MS_FIM_DE_LINHA : MS_POR_CHAR + Math.random() * 8;
    const t = window.setTimeout(() => setDigitados((n) => n + 1), atraso);
    return () => window.clearTimeout(t);
  }, [digitados, texto]);

  // Pular: qualquer tecla ou clique.
  useEffect(() => {
    const pular = (e: Event) => { e.preventDefault(); fim.current(); };
    window.addEventListener('keydown', pular);
    window.addEventListener('pointerdown', pular);
    return () => {
      window.removeEventListener('keydown', pular);
      window.removeEventListener('pointerdown', pular);
    };
  }, []);

  return (
    <div className="dt-boot" aria-busy="true" aria-label="Iniciando a area DEV">
      <pre aria-hidden="true">
        {texto.slice(0, digitados)}
        <span className="dt-cursor">_</span>
      </pre>
      <p className="dt-boot-dica">QUALQUER TECLA OU CLIQUE PULA</p>
    </div>
  );
}
