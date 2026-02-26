import { httpsCallable, getFunctions } from "firebase/functions";
import { app, firebaseInitError } from "@/lib/firebase";

type UserType = "cliente" | "funcionario";
type UserRole = "admin" | "gerente" | "operacional" | "cliente";

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