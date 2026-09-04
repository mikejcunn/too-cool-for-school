import { redirect } from 'next/navigation';

export default function Home() {
  redirect(`/s/${process.env.DEFAULT_ORG_SLUG || 'friends-of-winthrop'}`);
}
