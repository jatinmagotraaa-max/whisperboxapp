import { redirect } from 'next/navigation';

export default function ConfessPage() {
  // We merged the confession input into the feed directly!
  redirect('/feed');
}
