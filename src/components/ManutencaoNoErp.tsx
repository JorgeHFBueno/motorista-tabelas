import type { ReactNode } from 'react';
import { Box, Button, Tooltip, Typography, type ButtonProps } from '@mui/material';

// Norma de 2026-11-03: a manutenção é lançada no ERP, no CUSTO DA OBRA, e não pela WEB
// (The Manuscript, 03_APLICACAO_WEB/04_FROTA_E_MANUTENCOES.md). O formulário fica no código; o botão, desabilitado.

const exemplo = { fontFamily: 'monospace', fontSize: '0.8rem', color: 'common.white', bgcolor: 'rgba(255,255,255,0.14)', border: 0, borderRadius: 0.5, px: 0.75, py: 0.25, mt: 0.5, display: 'block', whiteSpace: 'pre-wrap' } as const;

function NormaManutencaoErp() {
    return (
        <Box sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Lançar no ERP, no CUSTO DA OBRA</Typography>
            <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>Com a formatação:</Typography>
            <Box component="code" sx={exemplo}>PLACA - KM - LITROS - PREÇO LITRO - CATEGORIA;</Box>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, '& li + li': { mt: 0.75 } }}>
                <li>A <b>placa</b> é escrita por extenso, sem hífen: <Box component="code" sx={{ ...exemplo, display: 'inline', mt: 0 }}>XXXYYYY</Box></li>
                <li>
                    O <b>"-"</b> entre os campos é obrigatório, mesmo com o campo vazio:
                    <Box component="code" sx={exemplo}>XXXYYYY - - 50 - 7.8 - 21;</Box>
                </li>
                <li>
                    O <b>";"</b> fecha cada placa, o que permite várias placas no mesmo lançamento:
                    <Box component="code" sx={exemplo}>XXXYYYY - 12000 - 50 - 7.8 - 21; ZZZWWWW - 50000 - 20 - 7.8 - 21;</Box>
                </li>
            </Box>
        </Box>
    );
}

/** Botão de adicionar manutenção, cinza (desabilitado), com a norma do ERP no balão (mouse ou toque). */
export default function BotaoManutencaoNoErp({ children, onClick, ...props }: Omit<ButtonProps, 'disabled'> & { children: ReactNode }) {
    return (
        <Tooltip
            title={<NormaManutencaoErp />}
            enterTouchDelay={0}
            leaveTouchDelay={15000}
            slotProps={{ tooltip: { sx: { maxWidth: 460, p: 1.5, bgcolor: 'grey.900' } } }}
        >
            <span tabIndex={0} aria-label={`${children} desabilitado: lançar no ERP, no CUSTO DA OBRA`}>
                <Button {...props} disabled onClick={onClick}>{children}</Button>
            </span>
        </Tooltip>
    );
}
