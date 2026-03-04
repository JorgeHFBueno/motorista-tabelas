import { FirebaseError } from "firebase/app";
import { httpsCallable, getFunctions } from "firebase/functions";
import { app, firebaseInitError } from "@/lib/firebase";

type UserType = "cliente" | "funcionario";
type UserRole = "admin" | "gerente" | "operacional" | "cliente";
type TrashKind = "documento" | "foto";
type TrashCollection = "documentos" | "fotos";

function requireFunctionsInstance() {
  if (!app) {
    throw firebaseInitError ?? new Error("Firebase app indisponível para Cloud Functions.");
  }

  return getFunctions(app, "southamerica-east1");
}

export interface AdminCreateUserInput {
  email: string;
  password: string;
  nome: string;
  tipo: UserType;
  role: UserRole;
  obras?: string[];
}

export interface AdminSetRoleInput {
  uid: string;
  role: UserRole;
  tipo?: UserType;
  ativo?: boolean;
}

export interface AdminLinkObraInput {
  uid: string;
  obraId: string;
}

export interface UserUpdateSelfProfileInput {
  nome: string;
}

export interface UserUpdateSelfProfileResponse {
  ok: true;
  nome: string;
}

export interface TrashMoveInput {
  kind: TrashKind;
  obraId: string;
  originalDocId: string;
  originalCollection: TrashCollection;
  originalStoragePath: string;
  trashedStoragePath: string;
  extra?: Record<string, unknown>;
}

export interface TrashRestoreInput {
  kind: TrashKind;
  obraId: string;
  trashedDocId: string;
  trashedStoragePath: string;
  originalStoragePath: string;
  originalCollection: TrashCollection;
  originalDocId: string;
}

export async function adminCreateUser(input: AdminCreateUserInput): Promise<{ uid: string }> {
  const callable = httpsCallable<AdminCreateUserInput, { uid: string }>(
    requireFunctionsInstance(),
    "adminCreateUser",
  );
  const result = await callable(input);
  return result.data;
}

export async function adminSetRole(input: AdminSetRoleInput): Promise<{ ok: boolean }> {
  const callable = httpsCallable<AdminSetRoleInput, { ok: boolean }>(
    requireFunctionsInstance(),
    "adminSetRole",
  );
  const result = await callable(input);
  return result.data;
}

export async function adminLinkObra(input: AdminLinkObraInput): Promise<{ ok: boolean }> {
  const callable = httpsCallable<AdminLinkObraInput, { ok: boolean }>(
    requireFunctionsInstance(),
    "adminLinkObra",
  );
  const result = await callable(input);
  return result.data;
}

export async function adminUnlinkObra(input: AdminLinkObraInput): Promise<{ ok: boolean }> {
  const callable = httpsCallable<AdminLinkObraInput, { ok: boolean }>(
    requireFunctionsInstance(),
    "adminUnlinkObra",
  );
  const result = await callable(input);
  return result.data;
}

export async function userUpdateSelfProfile(input: UserUpdateSelfProfileInput): Promise<UserUpdateSelfProfileResponse> {
  const callable = httpsCallable<UserUpdateSelfProfileInput, UserUpdateSelfProfileResponse>(
    requireFunctionsInstance(),
    "userUpdateSelfProfile",
  );
  const result = await callable(input);
  return result.data;
}

export async function trashMove(input: TrashMoveInput): Promise<{ ok: true; trashedDocId: string; trashedStoragePath: string }> {
  const callable = httpsCallable<TrashMoveInput, { ok: true; trashedDocId: string; trashedStoragePath: string }>(
    requireFunctionsInstance(),
    "trash_move",
  );
  const result = await callable(input);
  return result.data;
}

export async function trashRestore(input: TrashRestoreInput): Promise<{ ok: true; restoredDocId: string }> {
  const callable = httpsCallable<TrashRestoreInput, { ok: true; restoredDocId: string }>(
    requireFunctionsInstance(),
    "trash_restore",
  );
  const result = await callable(input);
  return result.data;
}

export function getCallableErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError && error.code === "functions/permission-denied") {
    return "Sem permissão para mover para lixeira";
  }

  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}