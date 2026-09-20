import { Request, Response, NextFunction } from 'express';

export interface ValidationRule {
  field: string;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  allowedValues?: any[];
}

// Limits
export const MAX_JSON_BODY_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_ATTACHMENT_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_PROMPT_CHARS = 4000;
export const MAX_EXECUTION_STEPS = 10;
export const MAX_RETRIES = 3;
export const TOOL_EXECUTION_TIMEOUT_MS = 30000;

export function validateBody(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const body = req.body || {};

    for (const rule of rules) {
      const val = body[rule.field];

      if (rule.required && (val === undefined || val === null || val === '')) {
        return res.status(400).json({
          error: `Missing required field: '${rule.field}'`,
          code: 'VALIDATION_FAILED',
        });
      }

      if (val !== undefined && val !== null) {
        if (rule.type === 'string' && typeof val !== 'string') {
          return res.status(400).json({
            error: `Field '${rule.field}' must be a string`,
            code: 'VALIDATION_FAILED',
          });
        }
        if (rule.type === 'number' && typeof val !== 'number') {
          return res.status(400).json({
            error: `Field '${rule.field}' must be a number`,
            code: 'VALIDATION_FAILED',
          });
        }
        if (rule.type === 'boolean' && typeof val !== 'boolean') {
          return res.status(400).json({
            error: `Field '${rule.field}' must be a boolean`,
            code: 'VALIDATION_FAILED',
          });
        }
        if (rule.type === 'array' && !Array.isArray(val)) {
          return res.status(400).json({
            error: `Field '${rule.field}' must be an array`,
            code: 'VALIDATION_FAILED',
          });
        }
        if (rule.maxLength && typeof val === 'string' && val.length > rule.maxLength) {
          return res.status(400).json({
            error: `Field '${rule.field}' exceeds maximum length of ${rule.maxLength} characters`,
            code: 'VALIDATION_FAILED',
          });
        }
        if (rule.allowedValues && !rule.allowedValues.includes(val)) {
          return res.status(400).json({
            error: `Field '${rule.field}' has invalid value. Allowed: ${rule.allowedValues.join(', ')}`,
            code: 'VALIDATION_FAILED',
          });
        }
      }
    }

    // Attachment size validation
    if (Array.isArray(body.attachments)) {
      for (const att of body.attachments) {
        if (att.size && typeof att.size === 'number' && att.size > MAX_ATTACHMENT_SIZE_BYTES) {
          return res.status(400).json({
            error: `Attachment '${att.name || 'file'}' exceeds limit of 8MB`,
            code: 'PAYLOAD_TOO_LARGE',
          });
        }
      }
    }

    next();
  };
}
