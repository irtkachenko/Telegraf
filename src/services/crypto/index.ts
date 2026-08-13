export {
  E2EE_CONTENT_MARKER,
  encryptMessageContentForDevices,
  decryptMessageContentForDevice,
  isSignalEncryptedMessage,
  resolveTargetDevices,
  encryptFileAttachment,
  decryptFileAttachment,
} from './encryption.service';
export type {
  EncryptedDeviceMessagePayload,
  EncryptedAttachmentPayload,
  DecryptedFileResult,
} from './encryption.service';