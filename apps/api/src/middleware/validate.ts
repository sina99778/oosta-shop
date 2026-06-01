// Request validation middleware backed by Zod. Validates body/query/params against
// the provided schemas; on failure the ZodError is forwarded to the central error
// handler (rendered as a 400 VALIDATION_ERROR).
//
// Express 5 note: `req.query` is read-only, so the coerced query is exposed on
// `res.locals.query` rather than reassigned. `req.body` and `req.params` are writable.

import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export type ValidationSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request["params"];
      }
      if (schemas.query) {
        res.locals.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
