export interface IEncryptedMedia {
  fileName?: string;
  version: number;
  encrypted: boolean;
  algorithm: string;
  iv: string;
  ciphertext: string;
  mimeType: string;
  sizeBytes: number;
}
