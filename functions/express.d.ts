import "express";
import { DecodedIdToken } from "firebase-admin/auth";

declare module "express-serve-static-core" {
  interface Request {    
    user?: DecodedIdToken & { admin?: boolean }; // JWT já verificado pelo middleware
  }
}
