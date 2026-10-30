"use client";

/**
 * Central form input sanitization & validation rules across the ERP.
 * Enforces:
 *  - Phone / Mobile / Contact inputs: strictly 10 digits, numbers only (0-9), no alphabets.
 *  - Aadhaar inputs: strictly 12 digits, numbers only.
 *  - PIN code inputs: strictly 6 digits, numbers only.
 *  - Numeric inputs: numbers only, no alphabets.
 *  - Email inputs: standard email format check.
 *  - Person Name inputs: alphabets & spaces, no digits.
 */

export const PHONE_RE = /^\d{10}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const AADHAAR_RE = /^\d{12}$/;
export const PINCODE_RE = /^\d{6}$/;
export const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function isPhoneLabel(label: string | undefined | null): boolean {
  if (!label) return false;
  return /\b(phone|mobile|contact|whatsapp|cell|tel)\b/i.test(label);
}

export function isAadhaarLabel(label: string | undefined | null): boolean {
  if (!label) return false;
  return /\b(aadhaar|aadhar|uidai)\b/i.test(label);
}

export function isPinCodeLabel(label: string | undefined | null): boolean {
  if (!label) return false;
  return /\b(pin\s*code|pincode|postal\s*code|zip\s*code)\b/i.test(label);
}

export function isPersonNameLabel(label: string | undefined | null): boolean {
  if (!label) return false;
  return /\b(student|father|mother|parent|guardian|visitor)\b.*\bname\b|^full\s*name$|^parent\s*name$/i.test(label);
}

/** Strips all non-digits and limits to 10 digits. */
export function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

/** Strips all non-digits and limits to `maxLen` digits. */
export function sanitizeDigits(raw: string, maxLen: number): string {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

/** Strips digits from person names. */
export function sanitizePersonName(raw: string): string {
  return raw.replace(/[0-9]/g, "");
}

export function validatePhone(value: string, required = false, label = "Phone number"): string | null {
  const v = value.trim();
  if (!v) return required ? `${label} is required` : null;
  if (!PHONE_RE.test(v)) return `${label} must be exactly 10 digits (numbers only)`;
  return null;
}

export function validateEmail(value: string, required = false, label = "Email"): string | null {
  const v = value.trim();
  if (!v) return required ? `${label} is required` : null;
  if (!EMAIL_RE.test(v)) return `Enter a valid ${label.toLowerCase()} (e.g. name@example.com)`;
  return null;
}

export function validatePersonName(value: string, required = false, label = "Name"): string | null {
  const v = value.trim();
  if (!v) return required ? `${label} is required` : null;
  if (/\d/.test(v)) return `${label} must not contain numbers`;
  if (v.length < 2) return `${label} must be at least 2 characters`;
  return null;
}

export type DynamicFieldSpec = {
  id?: string;
  key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  validation_rule: string | null;
};

/**
 * Live input sanitizer for dynamic admission fields: prevents alphabets in phone/number/Aadhaar/PIN fields
 * and prevents numbers in person name fields.
 */
export function sanitizeDynamicValue(field: Pick<DynamicFieldSpec, "label" | "field_type">, raw: string): string {
  if (field.field_type === "phone" || isPhoneLabel(field.label)) {
    return sanitizePhone(raw);
  }
  if (isAadhaarLabel(field.label)) {
    return sanitizeDigits(raw, 12);
  }
  if (isPinCodeLabel(field.label)) {
    return sanitizeDigits(raw, 6);
  }
  if (field.field_type === "number") {
    return raw.replace(/[^0-9.-]/g, "");
  }
  if (isPersonNameLabel(field.label)) {
    return sanitizePersonName(raw);
  }
  return raw;
}

/**
 * Validates a single dynamic admission field and returns a human-readable error message (or null if valid).
 */
export function validateDynamicField(field: DynamicFieldSpec, rawValue: string | undefined): string | null {
  const val = (rawValue ?? "").trim();
  if (!val) {
    return field.is_required ? `${field.label} is required` : null;
  }

  if (field.field_type === "phone" || isPhoneLabel(field.label)) {
    if (!PHONE_RE.test(val)) return `${field.label} must be exactly 10 digits (numbers only)`;
  } else if (isAadhaarLabel(field.label)) {
    if (!AADHAAR_RE.test(val)) return `${field.label} must be exactly 12 digits (numbers only)`;
  } else if (isPinCodeLabel(field.label)) {
    if (!PINCODE_RE.test(val)) return `${field.label} must be exactly 6 digits (numbers only)`;
  } else if (field.field_type === "email" || /\bemail\b/i.test(field.label)) {
    if (!EMAIL_RE.test(val)) return `Enter a valid email address for ${field.label}`;
  } else if (field.field_type === "number") {
    if (!NUMBER_RE.test(val)) return `${field.label} must be a valid number`;
  } else if (field.field_type === "date") {
    const parsed = Date.parse(val);
    if (Number.isNaN(parsed)) return `${field.label} must be a valid date`;
    if (/\b(dob|date of birth|birth date)\b/i.test(field.label) && parsed > Date.now()) {
      return `${field.label} cannot be in the future`;
    }
  } else if (isPersonNameLabel(field.label)) {
    if (/\d/.test(val)) return `${field.label} cannot contain numbers`;
    if (val.length < 2) return `${field.label} must be at least 2 characters`;
  }

  if (field.validation_rule && field.field_type !== "select") {
    try {
      const re = new RegExp(field.validation_rule);
      if (!re.test(val)) {
        if (field.validation_rule.includes("\\d{10}")) return `${field.label} must be 10 digits (numbers only)`;
        if (field.validation_rule.includes("\\d{12}")) return `${field.label} must be 12 digits (numbers only)`;
        return `${field.label} is not in the required format`;
      }
    } catch {
      // Ignore invalid regex in template
    }
  }

  return null;
}

/**
 * Validates all dynamic fields and returns a map of `key -> errorMessage`.
 */
export function validateAllDynamicFields(
  fields: DynamicFieldSpec[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const err = validateDynamicField(f, values[f.key]);
    if (err) errors[f.key] = err;
  }
  return errors;
}
