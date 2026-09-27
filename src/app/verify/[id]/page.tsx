import VerifyRoll from '@/components/VerifyRoll';

export default async function VerifyRollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerifyRoll id={id} />;
}
