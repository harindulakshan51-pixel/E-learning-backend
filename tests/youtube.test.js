import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId } from '../lib/security.js';

test('normalizes exact YouTube hosts and valid IDs', () => {
  for (const value of ['Abc_def-12', 'https://youtube.com/watch?v=Abc_def-12', 'https://youtu.be/Abc_def-12']) assert.throws(() => youtubeId(value));
  for (const value of ['Abc_def-123', ' https://www.youtube.com/watch?v=Abc_def-123&t=20 ', 'https://youtu.be/Abc_def-123?si=example', 'https://m.youtube.com/watch?v=Abc_def-123']) assert.equal(youtubeId(value), 'Abc_def-123');
});
test('rejects spoofed hosts, credentials, ambiguous IDs and malformed input', () => {
  for (const value of [null, {}, '', 'abcdefghij!', 'abcdefghijkl', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://evilyoutube.com/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'https://user@youtube.com/watch?v=abcdefghijk', 'http://youtu.be/abcdefghijk', 'https://youtu.be:444/abcdefghijk', 'https://youtu.be/abcdefghijk/extra', 'https://youtube.com/watch?v=abcdefghijk&v=lmnopqrstuv', 'javascript:abcdefghijk', 'https://youtube.com/watch?v=abc%2Fdefghij']) assert.throws(() => youtubeId(value), { status: 400 });
});
