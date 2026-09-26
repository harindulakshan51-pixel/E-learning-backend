export const storageBase = () => (process.env.SUPABASE_URL || 'https://wlbbtprbqprjphegkdtq.supabase.co').replace(/\/$/, '');
export const imageBucket = () => process.env.SUPABASE_IMAGE_BUCKET || 'Images';
export const publicImage = path => `${storageBase()}/storage/v1/object/public/${encodeURIComponent(imageBucket())}/${path.split('/').map(encodeURIComponent).join('/')}`;
export const defaultProfileImage = () => publicImage('defaultprofileBG .jpg');
export const defaultCourseImage = () => publicImage('1777212655835-Full Stack Web Development.jpg');
