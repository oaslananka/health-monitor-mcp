import type http from 'node:http';

type RequestBodyErrorCode =
  | 'payload_too_large'
  | 'body_timeout'
  | 'request_aborted'
  | 'parse_error';

export class RequestBodyError extends Error {
  public constructor(public readonly code: RequestBodyErrorCode) {
    super(code);
    this.name = 'RequestBodyError';
  }
}

function getDeclaredContentLength(req: http.IncomingMessage): number | null {
  const header = req.headers['content-length'];

  if (header === undefined) {
    return null;
  }

  if (Array.isArray(header) || !/^\d+$/.test(header)) {
    throw new RequestBodyError('parse_error');
  }

  const parsed = Number(header);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RequestBodyError('parse_error');
  }

  return parsed;
}

export async function readRequestBody(
  req: http.IncomingMessage,
  maxBodyBytes: number,
  bodyTimeoutMs: number
): Promise<unknown> {
  const declaredLength = getDeclaredContentLength(req);

  if (declaredLength !== null && declaredLength > maxBodyBytes) {
    req.resume();
    throw new RequestBodyError('payload_too_large');
  }

  const chunks: Buffer[] = [];
  let totalLength = 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
      }

      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
      req.off('close', onClose);
    };

    const rejectOnce = (error: RequestBodyError, discardBody: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      chunks.length = 0;

      if (discardBody && !req.destroyed) {
        req.resume();
      }

      reject(error);
    };

    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (buffer.length > maxBodyBytes - totalLength) {
        rejectOnce(new RequestBodyError('payload_too_large'), true);
        return;
      }

      totalLength += buffer.length;
      chunks.push(buffer);
    };

    const onEnd = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      const body = Buffer.concat(chunks, totalLength).toString('utf8');
      chunks.length = 0;

      if (body.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new RequestBodyError('parse_error'));
      }
    };

    const onError = (): void => {
      rejectOnce(new RequestBodyError('request_aborted'), false);
    };

    const onAborted = (): void => {
      rejectOnce(new RequestBodyError('request_aborted'), false);
    };

    const onClose = (): void => {
      if (!req.complete) {
        rejectOnce(new RequestBodyError('request_aborted'), false);
      }
    };

    timer = setTimeout(() => {
      rejectOnce(new RequestBodyError('body_timeout'), true);
    }, bodyTimeoutMs);
    timer.unref();

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);
  });
}
