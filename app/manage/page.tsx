import { redirect } from 'next/navigation';

// The arena dashboard moved to /admin.
export default function ManageMoved() {
  redirect('/admin');
}
