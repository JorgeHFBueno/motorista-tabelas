import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, TextField, Typography } from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { manuscriptChat, type ManuscriptChatProgress, type ManuscriptChatTurn } from '../../services/manuscript';

interface Message extends ManuscriptChatTurn { consultados?: string[] }

const errorText = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (code === 'functions/not-found' || (code === 'functions/internal' && /not.?found/i.test(message))) return 'O chat ainda não foi publicado nas Functions.';
  if (message.includes('MANUSCRIPT_CHAT_NOT_CONFIGURED') || code === 'functions/failed-precondition') return 'A chave da API da Anthropic ainda não foi configurada.';
  if (code === 'functions/permission-denied') return 'Seu acesso não inclui o chat do Manuscript.';
  if (code === 'functions/deadline-exceeded') return 'A resposta demorou demais. Tente uma pergunta mais específica.';
  if (message.includes('MANUSCRIPT_CHAT_MODEL_UNAVAILABLE')) return 'O modelo de IA não respondeu agora. Tente de novo em instantes.';
  return 'Não foi possível responder agora.';
};

/** Resolve o link que a IA cita (caminho .md relativo à raiz do Manuscript). */
const documentPath = (href: string) => { if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null; const [path] = href.replace(/^\.?\//, '').split('#', 1); return path.toLowerCase().endsWith('.md') ? path : null; };

/** Documentos citados nos links da resposta. */
const citedPaths = (markdown: string) => [...new Set([...markdown.matchAll(/\]\(([^)\s]+)\)/g)].flatMap((match) => documentPath(match[1]) ?? []))];

/** Avisos para o mapa: digitação, início da pesquisa, progresso, documentos citados e limpeza. */
export interface ManuscriptChatEvents {
  onCite: (path: string) => void;
  onTyping: (typing: boolean) => void;
  onStart: () => void;
  onProgress: (evento: ManuscriptChatProgress) => void;
  onAnswer: (cited: string[]) => void;
  onClear: () => void;
}

export default function ManuscriptChat({ onCite, onTyping, onStart, onProgress, onAnswer, onClear }: ManuscriptChatEvents) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  // Rola só a caixa de mensagens, nunca a página.
  useEffect(() => { const box = list.current; if (box && (messages.length || loading)) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const pergunta = draft.trim();
    if (!pergunta || loading) return;
    const historico = messages.map(({ role, text }) => ({ role, text })).slice(-20);
    setMessages((old) => [...old, { role: 'user', text: pergunta }]);
    setDraft(''); setError(''); setLoading(true); onStart();
    try {
      const answer = await manuscriptChat(pergunta, historico, onProgress);
      setMessages((old) => [...old, { role: 'assistant', text: answer.resposta, consultados: answer.consultados }]);
      onAnswer(citedPaths(answer.resposta));
    } catch (caught) {
      setError(errorText(caught));
      setMessages((old) => old.slice(0, -1));
      setDraft(pergunta);
    } finally { setLoading(false); }
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };

  return <section className="manuscript-chat" aria-label="Chat do Manuscript">
    <Stack direction="row" alignItems="center" justifyContent="space-between" className="manuscript-chat-header">
      <Typography variant="overline">Pergunte ao Manuscript</Typography>
      {messages.length > 0 && <IconButton size="small" aria-label="Limpar conversa" title="Limpar conversa" onClick={() => { setMessages([]); setError(''); onClear(); }} disabled={loading}><DeleteSweepRoundedIcon fontSize="small" /></IconButton>}
    </Stack>
    <Box className="manuscript-chat-messages" ref={list}>
      {messages.length === 0 && !loading && <Typography variant="body2" className="manuscript-chat-empty">Pergunte sobre coleções, Functions, telas ou regras. A resposta vem só da documentação, com links para os documentos usados. Ex.: “Quem grava em bombas?”</Typography>}
      {messages.map((message, index) => <article key={index} className={`manuscript-chat-message ${message.role}`}>
        {message.role === 'user' ? <Typography variant="body2">{message.text}</Typography> : <div className="manuscript-chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href = '', children }) => { const path = documentPath(href); return path ? <a href={`/the-manuscript/${encodeURI(path)}`} onClick={(e) => { e.preventDefault(); onCite(path); }}>{children}</a> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>; } }}>{message.text}</ReactMarkdown></div>}
        {!!message.consultados?.length && <Stack direction="row" spacing={.5} useFlexGap flexWrap="wrap" className="manuscript-chat-sources">{message.consultados.map((path) => <Chip key={path} size="small" variant="outlined" label={path.split('/').at(-1)} title={path} onClick={() => onCite(path)} />)}</Stack>}
      </article>)}
      {loading && <Stack direction="row" spacing={1} alignItems="center" className="manuscript-chat-loading"><CircularProgress size={16} /><Typography variant="caption">Lendo a documentação… pode levar até um minuto.</Typography></Stack>}
    </Box>
    {error && <Alert severity="warning" onClose={() => setError('')}>{error}</Alert>}
    <Box component="form" onSubmit={send} className="manuscript-chat-form">
      <TextField fullWidth multiline maxRows={6} size="small" value={draft} onChange={(e) => { setDraft(e.target.value); onTyping(e.target.value.trim().length > 0); }} onKeyDown={onKey} placeholder="Faça uma pergunta…" disabled={loading} inputProps={{ maxLength: 8000 }} />
      <Button type="submit" variant="contained" disabled={loading || !draft.trim()} aria-label="Enviar pergunta"><SendRoundedIcon fontSize="small" /></Button>
    </Box>
  </section>;
}
