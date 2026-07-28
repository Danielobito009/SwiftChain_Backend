/**
 * Unit/integration tests for evidenceService.
 *
 * Uses an in-memory MongoDB for persistence (project convention) and the
 * real LocalStorageDriver writing to a temp directory, so the upload path
 * is exercised end-to-end without hitting AWS.
 */

import fsSync from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Env vars must be set before `src/config/env` is first imported (it parses
// process.env at module load time), so this happens ahead of every import
// below that transitively pulls in the env module.
const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
process.env.UPLOAD_STORAGE_DRIVER = 'local';
process.env.UPLOAD_LOCAL_DIR = path.relative(process.cwd(), tempDir);
process.env.UPLOAD_MAX_FILE_SIZE_MB = '1';
process.env.APP_BASE_URL = 'http://localhost:3000';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { Evidence } from '../src/models/Evidence';
import { uploadEvidence, getEvidenceForDispute } from '../src/services/evidenceService';

let mongoServer: MongoMemoryServer;
const SETUP_TIMEOUT = 120_000;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, SETUP_TIMEOUT);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await fs.rm(tempDir, { recursive: true, force: true });
}, 15_000);

const validDisputeId = (): string => new mongoose.Types.ObjectId().toString();
const validUploaderId = (): string => new mongoose.Types.ObjectId().toString();

describe('uploadEvidence', () => {
  it('persists the file to local storage and creates an Evidence record', async () => {
    const disputeId = validDisputeId();
    const uploadedBy = validUploaderId();

    const evidence = await uploadEvidence({
      disputeId,
      uploadedBy,
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-bytes'),
      sizeBytes: 17,
    });

    expect(evidence.disputeId.toString()).toBe(disputeId);
    expect(evidence.url).toContain('/uploads/evidence/');
    expect(evidence.storageDriver).toBe('local');

    const writtenPath = path.join(tempDir, evidence.storageKey);
    const contents = await fs.readFile(writtenPath, 'utf-8');
    expect(contents).toBe('fake-image-bytes');
  });

  it('rejects an unsupported MIME type', async () => {
    await expect(
      uploadEvidence({
        disputeId: validDisputeId(),
        uploadedBy: validUploaderId(),
        originalName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        buffer: Buffer.from('x'),
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Unsupported file type/);
  });

  it('rejects a file exceeding the configured max size', async () => {
    await expect(
      uploadEvidence({
        disputeId: validDisputeId(),
        uploadedBy: validUploaderId(),
        originalName: 'huge.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.alloc(2 * 1024 * 1024),
        sizeBytes: 2 * 1024 * 1024, // 2MB > 1MB configured limit
      }),
    ).rejects.toThrow(/exceeds the maximum allowed size/);
  });

  it('rejects a malformed disputeId', async () => {
    await expect(
      uploadEvidence({
        disputeId: 'not-an-object-id',
        uploadedBy: validUploaderId(),
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('x'),
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Invalid disputeId/);
  });
});

describe('getEvidenceForDispute', () => {
  it('returns evidence for a dispute, newest first', async () => {
    const disputeId = validDisputeId();
    const uploadedBy = validUploaderId();

    await Evidence.create({
      disputeId,
      uploadedBy,
      storageDriver: 'local',
      storageKey: 'evidence/old.jpg',
      url: 'http://localhost:3000/uploads/evidence/old.jpg',
      originalName: 'old.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 10,
      createdAt: new Date('2024-01-01'),
    });
    await Evidence.create({
      disputeId,
      uploadedBy,
      storageDriver: 'local',
      storageKey: 'evidence/new.jpg',
      url: 'http://localhost:3000/uploads/evidence/new.jpg',
      originalName: 'new.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 10,
      createdAt: new Date('2024-06-01'),
    });

    const results = await getEvidenceForDispute(disputeId);

    expect(results).toHaveLength(2);
    expect(results[0].originalName).toBe('new.jpg');
  });

  it('rejects a malformed disputeId', async () => {
    await expect(getEvidenceForDispute('not-an-object-id')).rejects.toThrow(/Invalid disputeId/);
  });
});
