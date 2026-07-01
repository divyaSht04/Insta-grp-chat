import { PrismaClient, ConversationType, ParticipantRole } from '@prisma/client';

const prisma = new PrismaClient();

const FAKE_HASH = '$2b$10$seedplaceholderhashvalue.not.real.0000000000000000000';

async function main() {
  // 1. Clear existing data, child tables first so foreign keys don't block us.
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.followRequest.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user;

  // 2. Users, each created together with their profile (nested write).
  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      passwordHash: FAKE_HASH,
      profile: { create: { displayName: 'Alice', bio: 'Coffee and code.' } },
    },
  });
  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      passwordHash: FAKE_HASH,
      profile: { create: { displayName: 'Bob' } },
    },
  });
  const carol = await prisma.user.create({
    data: {
      email: 'carol@example.com',
      passwordHash: FAKE_HASH,
      profile: {
        create: { displayName: 'Carol', avatarUrl: 'https://example.com/carol.png' },
      },
    },
  });

  // 3. Social graph: mutual follow (Alice<->Bob), Carol follows Alice, Carol requests Bob.
  await prisma.follow.createMany({
    data: [
      { followerId: alice.id, followingId: bob.id },
      { followerId: bob.id, followingId: alice.id },
      { followerId: carol.id, followingId: alice.id },
    ],
  });
  await prisma.followRequest.create({
    data: { senderId: carol.id, receiverId: bob.id },
  });

  // 4. A DIRECT conversation with two participants and three messages (all nested).
  const dm = await prisma.conversation.create({
    data: {
      type: ConversationType.DIRECT,
      participants: {
        create: [{ user: { connect: { id: alice.id } } }, { user: { connect: { id: bob.id } } }],
      },
      messages: {
        create: [
          { sender: { connect: { id: alice.id } }, content: 'Hey Bob!' },
          { sender: { connect: { id: bob.id } }, content: 'Hi Alice, how are you?' },
          { sender: { connect: { id: alice.id } }, content: 'Doing great, thanks!' },
        ],
      },
    },
  });

  // 5. A GROUP conversation: Alice is ADMIN, Bob and Carol are members.
  const group = await prisma.conversation.create({
    data: {
      type: ConversationType.GROUP,
      name: 'Team Chat',
      participants: {
        create: [
          { user: { connect: { id: alice.id } }, role: ParticipantRole.ADMIN },
          { user: { connect: { id: bob.id } } },
          { user: { connect: { id: carol.id } } },
        ],
      },
      messages: {
        create: [
          { sender: { connect: { id: alice.id } }, content: 'Welcome to the team chat!' },
          { sender: { connect: { id: carol.id } }, content: 'Thanks! Excited to be here.' },
        ],
      },
    },
  });

  // 6. Attach an image to the group's first message.
  const firstGroupMessage = await prisma.message.findFirst({
    where: { conversationId: group.id },
    orderBy: { createdAt: 'asc' },
  });
  if (firstGroupMessage) {
    await prisma.attachment.create({
      data: {
        messageId: firstGroupMessage.id,
        url: 'https://example.com/welcome.png',
        mimeType: 'image/png',
        width: 800,
        height: 600,
        sizeBytes: 102400,
      },
    });
  }

  // 7. Read cursor: Bob has read the DM up to now.
  await prisma.participant.updateMany({
    where: { conversationId: dm.id, userId: bob.id },
    data: { lastReadAt: new Date() },
  });

  console.log('Seed complete: 3 users, follows, 1 DM, 1 group, 5 messages, 1 attachment.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
