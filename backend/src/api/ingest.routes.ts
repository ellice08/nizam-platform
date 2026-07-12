import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { authenticate } from '../middleware/auth.middleware.js';
import { ragService } from '../services/rag.service.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported: ${file.mimetype}`));
    }
  },
});

async function extractText(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<string> {
  if (mimetype === 'application/pdf') {
    // Import the internal lib directly — importing the package's index.js
    // trips its debug self-test (which tries to read a fixture file at
    // './test/data/05-versions-space.pdf' relative to cwd and throws ENOENT).
    // @ts-expect-error — no published types for this internal subpath
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimetype === 'text/plain' || mimetype === 'text/markdown') {
    return buffer.toString('utf-8');
  }

  throw new AppError(`Unsupported file type for ${filename}`, 400);
}

// POST /api/ingest/upload
router.post(
  '/upload',
  authenticate,
  upload.array('files', 5),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branchId: string | undefined =
        (req.body.branch_id as string | undefined) ?? req.tenant.branch_id ?? undefined;

      if (!branchId) {
        throw new AppError('branch_id is required — provide it in the request body', 400);
      }

      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        throw new AppError('No files provided', 400);
      }

      const results: Array<{ filename: string; chunksCreated: number; error?: string }> = [];

      for (const file of files) {
        try {
          logger.info(`Processing file: ${file.originalname} (${file.mimetype})`);

          const text = await extractText(file.buffer, file.mimetype, file.originalname);

          const { chunksCreated } = await ragService.ingestText({
            text,
            branchId,
            sourceType: 'upload',
            sourceUrl: `upload://${file.originalname}`,
            metadata: {
              filename: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
            },
          });

          results.push({ filename: file.originalname, chunksCreated });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          logger.error(`Failed to process ${file.originalname}: ${message}`);
          results.push({ filename: file.originalname, chunksCreated: 0, error: message });
        }
      }

      const totalChunks = results.reduce((s, r) => s + r.chunksCreated, 0);
      const failed = results.filter(r => r.error);

      res.status(201).json(
        ApiResponse.success(
          { results, totalChunks },
          failed.length > 0
            ? `${results.length - failed.length} of ${results.length} files indexed`
            : `${results.length} file(s) indexed — ${totalChunks} chunks created`
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/ingest/sources/:branchId
router.get(
  '/sources/:branchId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sources = await ragService.listSources(req.params['branchId'] as string);
      res.json(ApiResponse.success(sources));
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/ingest/source
router.delete(
  '/source',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branch_id, source_url } = req.body as { branch_id?: string; source_url?: string };

      if (!branch_id || !source_url) {
        throw new AppError('branch_id and source_url are required', 400);
      }

      const result = await ragService.deleteChunksBySource({ branchId: branch_id, sourceUrl: source_url });
      res.json(ApiResponse.success(result, `${result.deleted} chunks deleted`));
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/ingest/crawl
// Crawl a website and index it into the knowledge base
router.post(
  '/crawl',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { url, branch_id, max_pages } = req.body as {
        url?: string
        branch_id?: string
        max_pages?: number
      }

      if (!url) {
        throw new AppError('url is required', 400)
      }

      const branchId: string | undefined =
        branch_id ?? req.tenant.branch_id ?? undefined

      if (!branchId) {
        throw new AppError('branch_id is required', 400)
      }

      // Validate URL format
      try {
        new URL(url)
      } catch {
        throw new AppError('Invalid URL — must include https://', 400)
      }

      logger.info(`Starting crawl: ${url} for branch ${branchId}`)

      const result = await ragService.crawlAndIngest({
        url,
        branchId,
        maxPages: max_pages ?? 10,
      })

      res.status(201).json(
        ApiResponse.success(
          result,
          `Crawled ${result.pagesIndexed} page(s) — ${result.chunksCreated} chunks indexed`
        )
      )
    } catch (err) {
      next(err)
    }
  }
)

export default router;

