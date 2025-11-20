import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect root to bookkeeping dashboard by default for now
  redirect('/bookkeeping/dashboard');
}
