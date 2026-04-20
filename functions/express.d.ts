import "express";
import { DecodedIdToken } from "firebase-admin/auth";

declare module "express-serve-static-core" {
  interface Request {
    user?: DecodedIdToken & { admin?: boolean; isAdmin?: boolean };
    authorization?: {
      exists: boolean;
      adm1: boolean;
      adm2: boolean;
    };
  }
}
