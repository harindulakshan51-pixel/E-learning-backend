import axios from 'axios';
import { fail, textField } from './security.js';

function videoId(value) {
  const id = textField(value, 'VdoCipher video ID', 32);
  if (!/^[a-f0-9]{32}$/.test(id)) throw fail(400, 'Enter the 32-character VdoCipher video ID, not a URL');
  return id;
}
function config() {
  if (!process.env.VDOCIPHER_API_SECRET) throw fail(503, 'VdoCipher is not configured on the server');
  return { headers: { Authorization: 'Apisecret ' + process.env.VDOCIPHER_API_SECRET, Accept: 'application/json' }, timeout: 10000, maxRedirects: 0 };
}
function providerError(error) {
  if ([401, 403].includes(error.response?.status)) return fail(503, 'VdoCipher denied access. Check the server API secret and video permissions.');
  if (error.response?.status === 404) return fail(400, 'VdoCipher video not found. Check its Video ID.');
  return fail(503, 'VdoCipher is temporarily unavailable. Please try again.');
}
async function authorize(id) {
  const options = config();
  let data;
  try {
    ({ data } = await axios.post('https://dev.vdocipher.com/api/videos/' + id + '/otp', {
      ttl: 300, licenseRules: JSON.stringify({ canPersist: false }),
    }, options));
  } catch (error) { throw providerError(error); }
  if (!data || typeof data.otp !== 'string' || !data.otp || typeof data.playbackInfo !== 'string' || !data.playbackInfo) throw fail(503, 'VdoCipher returned an invalid playback response');
  return { otp: data.otp, playbackInfo: data.playbackInfo };
}
export async function verifyVdoCipherVideo(value) {
  const id = videoId(value);
  const options = config();
  let data;
  try { ({ data } = await axios.get('https://dev.vdocipher.com/api/videos/' + id, options)); }
  catch (error) { throw providerError(error); }
  if (data?.status !== 'ready') throw fail(400, 'This video is still processing or unavailable in VdoCipher');
  // Metadata alone does not prove this account can authorize the video.
  // Issue and discard a short-lived OTP before accepting an admin-supplied ID.
  await authorize(id);
  return { id, durationSeconds: Number.isFinite(data.length) ? Math.ceil(data.length) : 0 };
}
export async function playbackSession(video) {
  if (video.provider !== 'vdocipher' || !video.vdoCipherVideoId) throw fail(423, 'This lesson needs a VdoCipher video. Please contact your instructor.');
  const id = videoId(video.vdoCipherVideoId);
  // Caller must validate authentication and course enrollment before this request.
  return { provider: 'vdocipher', ...await authorize(id), expiresAt: Date.now() + 300000 };
}
