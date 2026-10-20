export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean => EMAIL_PATTERN.test(email.trim());

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
