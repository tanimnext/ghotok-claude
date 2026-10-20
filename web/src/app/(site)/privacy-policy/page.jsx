import { CmsPage, cmsMetadata } from '@/components/content/CmsPage';

const SLUG = 'privacy-policy';

export const generateMetadata = () => cmsMetadata(SLUG);

export default function Page() {
  return <CmsPage slug={SLUG} />;
}
