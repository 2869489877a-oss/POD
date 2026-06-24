export type AiGenerateImageClientResult = {
  asset_id?: string | null;
  error?: string;
  error_message?: string | null;
  job_id?: string;
  model?: string | null;
  provider?: string | null;
  queued?: boolean;
  result_url?: string | null;
  status?: string;
};

type AiGenerateImageJob = {
  asset_id?: string | null;
  error_message?: string | null;
  id: string;
  model_id?: string | null;
  provider_type?: string | null;
  result_url?: string | null;
  status?: string | null;
};

type AiGenerateImageJobResponse = {
  error?: string;
  job?: AiGenerateImageJob;
};

type WaitForAiGenerateImageOptions = {
  intervalMs?: number;
  onQueued?: (jobId: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type AiApplyPatternClientResult = {
  attempts?: unknown[];
  composite_url?: string | null;
  error?: string;
  error_message?: string | null;
  job_id?: string;
  model?: string | null;
  pattern_url?: string | null;
  provider?: string | null;
  queued?: boolean;
  status?: string;
};

type AiApplyPatternJob = {
  error_message?: string | null;
  id: string;
  result?: AiApplyPatternClientResult | null;
  status?: string | null;
};

type AiApplyPatternJobResponse = {
  error?: string;
  job?: AiApplyPatternJob;
};

async function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readAiJson<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text.slice(0, 500) } as T;
  }
}

export async function waitForAiGenerateImageJob(
  jobId: string,
  options: WaitForAiGenerateImageOptions = {},
): Promise<AiGenerateImageClientResult> {
  const timeoutMs = options.timeoutMs ?? 420_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const response = await fetch(`/api/ai/generate-image/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
      signal: options.signal,
    });
    const data = await readAiJson<AiGenerateImageJobResponse>(response);

    if (!response.ok) {
      throw new Error(data.error || "Failed to load AI generation job");
    }

    const job = data.job;
    if (!job) {
      throw new Error("AI generation job was not found");
    }

    if (job.status === "completed") {
      if (!job.result_url) {
        throw new Error("AI generation completed without an image URL");
      }

      return {
        asset_id: job.asset_id ?? undefined,
        job_id: job.id,
        model: job.model_id ?? undefined,
        provider: job.provider_type ?? undefined,
        result_url: job.result_url,
        status: "completed",
      };
    }

    if (job.status === "failed") {
      throw new Error(job.error_message || "AI generation failed");
    }

    await delay(intervalMs, options.signal);
  }

  throw new Error("AI generation timed out");
}

export async function readAiGenerateImageResult(
  response: Response,
  options: WaitForAiGenerateImageOptions = {},
): Promise<AiGenerateImageClientResult> {
  const data = await readAiJson<AiGenerateImageClientResult>(response);
  const jobId = data.job_id;

  if (jobId) {
    options.onQueued?.(jobId);
  }

  if (!response.ok) {
    throw new Error(data.error || data.error_message || "AI generation failed");
  }

  if (
    jobId
    && (
      data.queued === true
      || data.status === "pending"
      || data.status === "processing"
      || !data.result_url
    )
  ) {
    return waitForAiGenerateImageJob(jobId, options);
  }

  if (!data.result_url) {
    throw new Error(data.error || data.error_message || "AI generation completed without an image URL");
  }

  return data;
}

export async function waitForAiApplyPatternJob(
  jobId: string,
  options: WaitForAiGenerateImageOptions = {},
): Promise<AiApplyPatternClientResult> {
  const timeoutMs = options.timeoutMs ?? 420_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const response = await fetch(`/api/ai/generate-and-apply/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
      signal: options.signal,
    });
    const data = await readAiJson<AiApplyPatternJobResponse>(response);

    if (!response.ok) {
      throw new Error(data.error || "Failed to load AI apply-pattern job");
    }

    const job = data.job;
    if (!job) {
      throw new Error("AI apply-pattern job was not found");
    }

    if (job.status === "completed") {
      if (!job.result?.pattern_url || !job.result?.composite_url) {
        throw new Error("AI apply-pattern job completed without image URLs");
      }

      return {
        ...job.result,
        job_id: job.id,
        status: "completed",
      };
    }

    if (job.status === "failed") {
      throw new Error(job.error_message || "AI apply-pattern job failed");
    }

    await delay(intervalMs, options.signal);
  }

  throw new Error("AI apply-pattern job timed out");
}

export async function readAiApplyPatternResult(
  response: Response,
  options: WaitForAiGenerateImageOptions = {},
): Promise<AiApplyPatternClientResult> {
  const data = await readAiJson<AiApplyPatternClientResult>(response);
  const jobId = data.job_id;

  if (jobId) {
    options.onQueued?.(jobId);
  }

  if (!response.ok) {
    throw new Error(data.error || data.error_message || "AI apply-pattern job failed");
  }

  if (
    jobId
    && (
      data.queued === true
      || data.status === "pending"
      || data.status === "processing"
      || !data.pattern_url
      || !data.composite_url
    )
  ) {
    return waitForAiApplyPatternJob(jobId, options);
  }

  if (!data.pattern_url || !data.composite_url) {
    throw new Error(data.error || data.error_message || "AI apply-pattern job completed without image URLs");
  }

  return data;
}
