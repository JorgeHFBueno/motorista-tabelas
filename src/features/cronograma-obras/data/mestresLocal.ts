import { MESTRE_COLORS, type MestreColor } from '../domain/mestres';

export type MestreLocal = { id: string; nome: string; cor: MestreColor };
export const MESTRES_STORAGE_KEY = 'cronoobra.mestres.v1';
export const MESTRES_BASELINE = ['DINE', 'DILAMAR', 'JEFE', 'VANDERLEI', 'RUDIMAR', 'EVERALDO', 'AMILTON', 'FIRMINO', 'RUDI', 'ANTÔNIO', 'TIAGO', 'RODRIGO', 'ANTONIO'];
const reservedColors = new Set(['#1976d2', '#ed6c02', '#d32f2f']);
const normalizedName = (name: string) => name.trim().toLocaleLowerCase('pt-BR');
const baseline = (): MestreLocal[] => MESTRES_BASELINE.map((nome, index) => ({ id: `baseline-${index + 1}`, nome, cor: MESTRE_COLORS[index] ?? generatedColor(index, new Set()) }));
const generatedColor = (index: number, used: Set<string>): MestreColor => { let step = index; while (true) { const background = `hsl(${((step * 137.508 + 112) % 360).toFixed(1)} 42% 34%)`; if (!used.has(background) && !reservedColors.has(background)) return { background, text: '#ffffff' }; step++; } };
export function loadMestres(storage: Storage = localStorage): MestreLocal[] { const raw = storage.getItem(MESTRES_STORAGE_KEY); if (raw) { try { const value = JSON.parse(raw); if (Array.isArray(value)) return value; } catch { /* reset malformed local-only data */ } } const value = baseline(); storage.setItem(MESTRES_STORAGE_KEY, JSON.stringify(value)); return value; }
export function addMestre(mestres: MestreLocal[], nome: string): MestreLocal[] { const clean = nome.trim(); if (!clean) throw new Error('Informe o nome do mestre.'); if (mestres.some((mestre) => normalizedName(mestre.nome) === normalizedName(clean))) throw new Error('Já existe um mestre com esse nome.'); const used = new Set(mestres.map((mestre) => mestre.cor.background)); const index = mestres.length; const cor = MESTRE_COLORS.find((color) => !used.has(color.background) && !reservedColors.has(color.background)) ?? generatedColor(index, used); return [...mestres, { id: crypto.randomUUID(), nome: clean, cor }]; }
export function persistMestres(mestres: MestreLocal[], storage: Storage = localStorage) { storage.setItem(MESTRES_STORAGE_KEY, JSON.stringify(mestres)); }
