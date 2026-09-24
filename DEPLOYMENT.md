# Scholarly access-control upgrade

## Implemented behavior
- Existing MongoDB accounts and bcrypt passwords remain in use. Login creates a one-hour HttpOnly cookie. Admin permissions and blocked status are reloaded from MongoDB on every authenticated request. Old indefinite JWTs are rejected. Password reset and logout invalidate sessions.
- Course overviews remain public. All lesson routes, including old previews, require an active enrollment or an administrator. Orders are retired (HTTP 410).
- Admin Access Codes issues 128-bit random, single-use, course-specific codes. Optional email assignment and expiry are supported. Full codes appear only once to the issuing admin; only a SHA-256 digest and a short display suffix are stored. Revoke and issue a replacement instead of editing an issued secret. Example format only: CRS-91D4-A3E8-72CB-60F9-5B2D-EA71-08C6-43FD.
- Redemption is one MongoDB transaction covering code consumption and enrollment. The database's unique user/course index prevents duplicate enrollments. MongoDB Atlas or another replica set is required.
- Admin Enrollments supports student search, course drill-down, date/status filters, progress, activity, legacy verification and revocation. Reported completion is a convenience metric, not proof of attendance.
- My Courses includes only the signed-in student's active enrollments for available courses. It resumes the last lesson and periodically saved position.

## Video decision and limitations
The owner explicitly chose **DRM hosting; keep YouTube disabled**. Accordingly, no YouTube embeds or direct video URLs are accepted. Mux DRM is the implemented provider adapter; no account, paid subscription, or remote assets were created.

New lessons use a Mux DRM playback ID. The backend checks Mux's API for a ready asset, a DRM playback policy, no public/non-DRM playback IDs, and no static download renditions. Students receive scoped RS256 playback and DRM license tokens, never signing keys or API credentials. Tokens expire after five minutes; the player renews them every two minutes and checks enrollment every 30 seconds. No offline license is requested.

Revocation blocks new API access immediately. Previously issued tokens remain valid until expiry; an already-issued provider license and buffered media are not remotely erased. Mux currently documents a 24-hour default streaming license. The client checks are useful UX, not the security boundary. DRM substantially raises protection but cannot guarantee prevention of all copying or external-camera recording. Do not market the service as absolutely download-proof. Mux protects video tracks; its documented DRM limitations for audio must also be considered.

The player provides play/pause, seeking and available quality selection. Resolution availability depends on the source and provider renditions; upload sources at 720p or better and verify required renditions on target devices. Browser DRM compatibility, real license playback, quality switching and long-video token renewal must be validated with a configured Mux account before launch.

References:
- https://www.mux.com/docs/guides/protect-videos-with-drm
- https://www.mux.com/docs/guides/secure-video-playback
- https://www.mux.com/docs/api-reference/video/playback-id/get-asset-or-livestream-id

## Deployment sequence
1. Back up MongoDB and Supabase Storage. Stop old API writes during migration. Keep backups access-controlled: legacy video URLs and account data are sensitive.
2. Configure backend environment using .env.example. Use a dedicated strong JWT secret. Run the API and frontend on the same HTTPS site (for example app.example.com and api.example.com) because cookies use SameSite=Lax. Set FRONTEND_ORIGINS to exact permitted origins, comma separated; no wildcard. Use NODE_ENV=production for Secure cookies. If a reverse proxy is used, preserve Origin and configure a trusted proxy topology explicitly before changing Express trust proxy. Current rate limiting conservatively uses the direct peer IP.
3. In backend: npm ci, then npm run migrate for a dry-run summary. Run npm run migrate -- --apply after reviewing the summary. The migration is repeatable.
   - Users, courses, orders and lesson URLs are preserved.
   - Duplicate enrollment rows are archived in enrollment_duplicate_archive before consolidation. Revoked records take precedence.
   - Enrollments backed by Completed orders remain active; missing completed-order enrollments are recovered.
   - Existing records without payment evidence become pending_review. The old endpoint allowed self-enrollment, so its paymentStatus default is not sufficient evidence. Verify legitimate access in Admin > Enrollments and approve it. Never bulk-approve unknown records.
   - Unique access-code and enrollment indexes and the shared rate-limit TTL index are created. The API must not be exposed before migration completes.
   - Old reset codes without expiry are invalidated.
4. Apply migrations/001-storage-lockdown.sql in the correct Supabase project SQL editor. This makes the videos bucket private and adds restrictive policies preventing browser access to videos and browser writes to Images even if old permissive policies exist. Public image reads can remain.
   - Inspect the project's actual storage policies and bucket names before applying; this repository contained no existing RLS definitions or live policy export.
   - Verify an old public video URL fails without credentials. Check CDN caches and revoke any previously generated signed links according to your Supabase configuration. Merely hiding the URL in this application cannot remove copies already shared.
   - Never expose SUPABASE_SERVICE_ROLE_KEY in Vite. Images now upload through the admin-authorized backend /api/media endpoint. The frontend no longer initializes Supabase clients.
5. Create/configure a Mux environment with DRM enabled. Complete Mux/FairPlay prerequisites. This is a paid external service and remains an owner setup step.
   - Provision a read-capable Mux Video API token and RSA signing key, then set MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY_BASE64 only on the server.
   - Create a playback restriction for your production domains; disallow missing referrers where supported. Set MUX_PLAYBACK_RESTRICTION_ID.
   - Upload original lesson files as DRM assets using Mux's documented advanced_playback_policies and DRM configuration. Do not add public or ordinary signed playback IDs, MP4 renditions or offline downloads.
   - Edit each legacy lesson in Admin > Videos and supply the DRM playback ID. Existing lesson IDs/order/course relationships stay intact. Legacy URLs stay stored for rollback/migration but are not returned by API responses or used by the player.
   - No automatic transfer from Supabase or YouTube occurs. Legacy lessons remain unavailable until migrated.
6. Configure SMTP_USER and GMAIL_APP_PASSWORD; test reset delivery. Existing passwords still work; new passwords must be at least 12 characters and at most 72 bytes.
7. In frontend (directory is spelled frountend): set VITE_BACKEND_URL to your API base ending in /api, npm ci, npm run lint, npm run build. Serve HTTPS with SPA fallback to index.html. Apply an appropriate host CSP and HSTS; permit the Mux endpoints needed for media, license and thumbnails.
8. Run npm test in backend against its disposable MongoDB replica set, then perform the live-provider acceptance checks below. Deploy frontend and backend together.

## Acceptance checks
- A new registered student sees an empty My Courses page and cannot fetch any lesson or playback session.
- Generate an assigned code, redeem it for the correct course, verify resume, then revoke enrollment and confirm new playback-token requests fail.
- Try simultaneous redemption, wrong-course, expired, revoked and reused codes; only one enrollment should commit.
- Test Chrome/Edge Widevine, Safari FairPlay and mobile targets with actual DRM assets, including 720/480/360 where available, seeking, token renewal beyond five minutes, and unavailable/processing assets.
- Verify copied uncredentialed media links, non-DRM asset IDs, old Supabase URLs and unauthorized image uploads fail.
- Verify admin routes reject student sessions and password reset invalidates old sessions.

## Validation and scope
Automated tests use only a disposable MongoDB replica set, not .env production data. DRM API responses and signing are tested with fixtures; they do not demonstrate live provider compatibility. Database migrations and storage SQL are provided but have not been run on the owner's live services.

The existing visual design, course catalog, instructors, account records and course editor are retained. The repositories are separate backend and frountend Git working trees. No commits or deployments were made.

## Main changed files
- app.js, middlewares/authenticate.js, lib/session.js: API protections, expiring sessions, live account authorization and trusted-origin checks.
- controllers/userController.js, models/Otp.js: protected account operations and expiring, hashed password reset codes.
- routers/accessCodeRouter.js, models/accessCode.js: random issuance, one-time display, expiry, assignment and revocation.
- controllers/enrollmentController.js, models/enrollment.js: atomic redemption, active enrollments, resume and admin reporting.
- controllers/coursevideoController.js, lib/drm.js: enrollment-gated DRM verification and signed playback sessions.
- migrations/001-access-control.js, migrations/001-storage-lockdown.sql: data-preserving MongoDB migration and Supabase media lockdown.
- lib/databaseReady.js: startup refuses missing security indexes.
- ../frountend/src/pages/admin/adminAccessCodes.jsx, adminEnrollments.jsx and adminVideosPage.jsx: new management workflows.
- ../frountend/src/components/EnrollCourse.jsx and ProtectedPlayer.jsx: enrollment and DRM player components.
- ../frountend/src/pages/myLearningPage.jsx and courseVideos.jsx: student course library and protected watch page.
- ../frountend/src/components/header.jsx, AdminRoute.jsx and ../frountend/src/pages/homepage.jsx: navigation and route changes.

Final local checks: 17 backend tests passed; frontend lint passed; production build passed. Dependency audits after compatible fixes and the Nodemailer update reported zero known vulnerabilities. The build retains a non-failing bundle-size warning because the DRM player is substantial. Local browser checks confirmed student sign-in/empty My Courses and admin code generation. Live DRM playback, production SMTP delivery and actual Supabase policy behavior still require configured external services.

The supplied YouTube reference is https://www.youtube.com/watch?v=E5hQgK5Lm6E . The owner reconfirmed DRM-only after providing it. It is not embedded or fetched by the application. Obtain the original source file from the owner and upload it as a DRM asset in Mux.
