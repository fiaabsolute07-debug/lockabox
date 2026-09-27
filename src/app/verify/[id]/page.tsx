import type { Metadata } from 'next';
import VerifyRoll from '@/components/VerifyRoll';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const image = `/api/rolls/${encodeURIComponent(id)}/og`;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:4310'),
    title: `Verify pull #${id} · Lockabox`,
    openGraph: { images: [image] },
    twitter: { card: 'summary_large_image', images: [image] },
  };
}

export default async function VerifyRollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerifyRoll id={id} />;
}
