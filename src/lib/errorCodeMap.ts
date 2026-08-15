import i18n from "@/i18n";

const errorCodeMap: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: "errors.auth.invalidCredentials",
  AUTH_INACTIVE_ACCOUNT: "errors.auth.inactiveAccount",
  AUTH_EMAIL_EXISTS: "errors.auth.emailExists",
  AUTH_PERMISSION_DENIED: "errors.auth.permissionDenied",
  NOTE_NOT_FOUND: "errors.note.notFound",
  NOTE_LOCKED: "errors.note.locked",
  NOTE_SIGNED: "errors.note.signed",
  NOTE_STATUS_TRANSITION: "errors.note.statusTransition",
  NOTE_PERMISSION_DENIED: "errors.note.permissionDenied",
  NOTE_LOCK_ROLE_REQUIRED: "errors.note.lockRoleRequired",
  NOTE_ADMIN_PASSWORD_INVALID: "errors.note.adminPasswordInvalid",
  ITEM_NOT_FOUND: "errors.inventory.notFound",
  ITEM_BARCODE_EXISTS: "errors.inventory.barcodeExists",
  ITEM_STOCK_INSUFFICIENT: "errors.inventory.stockInsufficient",
  FILE_NOT_FOUND: "errors.file.notFound",
  FILE_BLOCKED_MIME: "errors.file.blockedMime",
  FILE_UPLOAD_FAILED: "errors.file.uploadFailed",
  SIGNATURE_PASSWORD_INVALID: "errors.signature.passwordInvalid",
  EXPORT_NOT_FOUND: "errors.export.notFound",
  ERR_VALIDATION: "errors.common.validation",
  INTERNAL_ERROR: "errors.common.internal",
  SERVICE_UNAVAILABLE: "errors.common.serviceUnavailable",
};

export function getErrorMessage(
  code: string | undefined,
  fallbackMessage: string
): string {
  if (!code) return fallbackMessage;

  const i18nKey = errorCodeMap[code];
  if (!i18nKey) return fallbackMessage;

  const translated = i18n.t(i18nKey, { ns: "errors" });
  // i18next returns the key itself if translation is missing
  if (translated === i18nKey) return fallbackMessage;

  return translated;
}

export default errorCodeMap;
