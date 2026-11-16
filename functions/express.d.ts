import "express";
import { DecodedIdToken } from "firebase-admin/auth";

declare module "express-serve-static-core" {
  interface Request {
    user?: DecodedIdToken & { admin?: boolean; isAdmin?: boolean };
    authorization?: {
      exists: boolean;
      ativo: boolean;
      credenciais: Record<'adm2' | 'motorista' | 'frentista' | 'mecanico' | 'retr0', boolean>;
      areas: Partial<Record<'combustivel' | 'frota' | 'logistica' | 'engenharia' | 'portal' | 'cadastros' | 'manuscript' | 'friday', 'ver' | 'editar'>>;
    };
  }
}
