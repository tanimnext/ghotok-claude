import { CmsPage, cmsMetadata } from '@/components/content/CmsPage';

const SLUG = 'terms';

export const generateMetadata = () => cmsMetadata(SLUG);

export default function Page() {
  return <CmsPage slug={SLUG} />;
}
