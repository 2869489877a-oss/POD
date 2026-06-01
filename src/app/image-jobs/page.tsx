import { ImageJobsCenter, type ImageJob } from "@/components/image-jobs-center";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const jobColumns = [
  "id",
  "job_type",
  "status",
  "total_count",
  "success_count",
  "failed_count",
  "error_message",
  "created_at",
  "updated_at",
].join(",");

async function getInitialJobs(): Promise<{ error: string | null; jobs: ImageJob[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("image_jobs")
      .select(jobColumns)
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message, jobs: [] };
    }

    return { error: null, jobs: (data ?? []) as unknown as ImageJob[] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "读取图片任务失败",
      jobs: [],
    };
  }
}

export default async function ImageJobsPage() {
  const { error, jobs } = await getInitialJobs();

  return (
    <PageShell title="批量图片处理" description="用于查看和管理图片处理任务。">
      <ImageJobsCenter initialError={error} initialJobs={jobs} />
    </PageShell>
  );
}
