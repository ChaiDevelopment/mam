export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <article className="container-page prose-mam max-w-3xl space-y-4 pt-8 [&_h1]:text-h1 [&_h1]:font-extrabold [&_h2]:mt-6 [&_h2]:text-h3 [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-body">{children}</article>;
}
