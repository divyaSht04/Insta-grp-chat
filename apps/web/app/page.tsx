import type { PublicUser } from '@repo/shared';

const demoUser: PublicUser = {
  id: '1',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
};

export default function Home() {
  return (
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Messaging Platform</h1>
      <p>Shared type in action: {demoUser.displayName}</p>
    </main>
  );
}
