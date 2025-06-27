import "express";
import { DecodedIdToken } from "firebase-admin/auth";

declare module "express-serve-static-core" {
  interface Request {
    /** JWT já verificado pelo middleware */
    user?: DecodedIdToken & { admin?: boolean };
  }
}
