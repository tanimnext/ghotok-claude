import { redirect } from 'next/navigation';
import { VerifyForm } from '@/components/auth/VerifyForm';
import { getTranslator } from '@/lib/preferences.server';

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t('auth.verifyTitle'), robots: { index: false } };
}

export default async function VerifyPage({ searchParams }) {
  const { identifier, next } = await searchParams;
  if (!identifier) redirect('/login');
  return <VerifyForm identifier={identifier} next={next} />;
}
