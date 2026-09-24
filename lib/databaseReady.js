// Starting without the migration would silently remove concurrency guarantees.
export async function assertDatabaseReady(db) {
  for (const [collection, fields] of [
    ['enrollments', { userId: 1, courseId: 1 }],
    ['accesscodes', { digest: 1 }],
    ['courses', { courseId: 1 }],
    ['users', { email: 1 }],
  ]) {
    const indexes = await db.collection(collection).indexes().catch(() => []);
    if (!indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(fields))) {
      throw new Error('Required security indexes are missing. Back up the database and run npm run migrate -- --apply before starting the API.');
    }
  }
}
