import { notFound } from 'next/navigation';
import { requireCreatorOsPageSession } from '@/src/lib/creatorOsPageGuard';
import ReviewClient from './ReviewClient';

export const metadata = {
  title: 'Review Hub Execution Request - MavenSync Creator OS',
};

export default async function CreatorExecutionReviewPage({ params }) {
  await requireCreatorOsPageSession();
  const { reference } = await params;
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(reference)) notFound();
  return <ReviewClient reference={reference} />;
}
