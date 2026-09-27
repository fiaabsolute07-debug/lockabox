import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { legalDoc, type LegalSlug } from '@/content/legal';

const SLUGS: LegalSlug[] = ['terms', 'privacy', 'disclaimer', 'sponsored'];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = legalDoc(slug);
  if (!doc) return { title: 'Legal · Lockabox' };
  return { title: `${doc.title.en} · Lockabox` };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as LegalSlug)) notFound();
  const doc = legalDoc(slug);
  if (!doc) notFound();
  return <main className="simple-page legal-page"><article className="simple-card panel"><span className="eyebrow">LOCKABOX LEGAL</span><h1>{doc.title.en}</h1><p className="legal-updated">Last updated {doc.updated}</p>{doc.status === 'draft' && <div className="legal-draft" role="note">Draft — pending legal review</div>}<div className="legal-sections">{doc.sections.map((section) => <section key={section.h.en}><h2>{section.h.en}</h2>{section.p.en.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}</div></article></main>;
}
