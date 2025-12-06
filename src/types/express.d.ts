import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        role: UserRole;
      };
      validatedQuery?: any;
    }
  }
}

type Files = {
  image?: Express.Multer.File[];
  [fieldname: string]: Express.Multer.File[] | undefined;
};
