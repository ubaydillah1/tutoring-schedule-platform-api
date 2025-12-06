import { ZodError, ZodType } from "zod";
import type { Request, Response, NextFunction } from "express";

export const validate =
  (schema: ZodType, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const data =
        source === "body"
          ? req.body
          : source === "query"
          ? req.query
          : req.params;

      const parsedData = schema.parse(data);

      if (source === "body") {
        req.body = parsedData as any;
      } else if (source === "params") {
        req.params = parsedData as any;
      } else if (source === "query") {
        req.validatedQuery = parsedData;
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          message: "Validation Error",
          errors: err.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }

      res.status(500).json({ message: (err as Error).message });
    }
  };
