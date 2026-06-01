type EmptyPageProps = {
  title: string;
  description: string;
};

export function EmptyPage({ title, description }: EmptyPageProps) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8">
      <p className="text-sm font-medium text-zinc-950">{title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}
