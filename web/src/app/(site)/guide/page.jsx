import { CmsPage, cmsMetadata } from '@/components/content/CmsPage';

const SLUG = 'guide';

export const generateMetadata = () => cmsMetadata(SLUG);

export default function Page() {
  return <CmsPage slug={SLUG} />;
}
