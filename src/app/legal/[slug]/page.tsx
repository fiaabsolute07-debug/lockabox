import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { legalDoc, type LegalSlug } from '@/content/legal';
import LegalDocument from '@/components/LegalDocument';

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
  return <LegalDocument doc={doc} />;
}
