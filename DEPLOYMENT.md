# Scholarly access-control upgrade

## Implemented behavior
- Existing MongoDB accounts and bcrypt passwords remain in use. Login creates a one-hour HttpOnly cookie. Admin permissions and blocked status are reloaded from MongoDB on every authenticated request. Old indefinite JWTs are rejected. Password reset and logout invalidate sessions.
- Course overviews remain public. All lesson routes, including old previews, require an active enrollment or an administrator. Orders are retired (HTTP 410).
- Admin Access Codes issues 128-bit random, single-use, course-specific codes. Optional email assignment and expiry are supported. Full codes appear only once to the issuing admin; only a SHA-256 digest and a short display suffix are stored. Revoke and issue a replacement instead of editing an issued secret. Example format only: CRS-91D4-A3E8-72CB-60F9-5B2D-EA71-08C6-43FD.
- Redemption is one MongoDB transaction covering code consumption and enrollment. The database's unique user/course index prevents duplicate enrollments. MongoDB Atlas or another replica set is required.
- Admin Enrollments supports student search, course drill-down, date/status filters, progress, activity, legacy verification and revocation. Reported completion is a convenience metric, not proof of attendance.
- My Courses includes only the signed-in student's active enrollments for available courses. It resumes the last lesson and periodically saved position.

## Video decision and limitations
Lessons now use normalized YouTube video IDs, validated on the backend. Admins may paste HTTPS watch/short links or an 11-character ID. Preview checks availability through the official YouTube player; syntactically valid IDs do not guarantee a video exists or allows embedding.

Plyr is isolated in `YouTubePlayer.jsx`. Controls include play/pause, ten-second skips, seek, elapsed time/duration, volume/mute, available speeds, captions and fullscreen. YouTube manages quality. Controls sit below the frame; required YouTube branding, links and ads remain accessible. This provides no DRM or protection from downloads, sharing or direct YouTube access.

Every lesson request checks the session and active enrollment (admins have explicit preview access). The website rechecks access every 15 seconds and on tab visibility, stopping on denied or unverifiable access. This cannot revoke direct YouTube access. Progress saves every 15 seconds while playing, on pause/completion and on lesson cleanup. Abrupt browser/process termination can lose the final interval. Database resume uses the existing last-lesson position; positions for other lessons are retained during the current watch-page visit.

References: https://github.com/sampotts/plyr and https://developers.google.com/youtube/iframe_api_reference

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
5. Back up the database and run `node migrations/002-youtube-lessons.js` for a dry run. Use `--apply` to normalize existing YouTube URLs/IDs. It only sets `youtubeVideoId`; it preserves original source fields, lesson IDs, order, users and progress. Missing/non-YouTube sources need an administrator to assign a replacement in Admin > Videos. No remote videos are transferred or deleted. The migration has not been run against live data.
6. Configure SMTP_USER and GMAIL_APP_PASSWORD; test reset delivery. Existing passwords still work; new passwords must be at least 12 characters and at most 72 bytes.
7. In frontend (directory is spelled frountend): set VITE_BACKEND_URL to your API base ending in /api, npm ci, npm run lint, npm run build. Serve HTTPS with SPA fallback to index.html. Apply an appropriate host CSP and HSTS; permit YouTube/YouTube-nocookie frames, the YouTube IFrame API and ytimg thumbnails in CSP. Use Referrer-Policy: strict-origin-when-cross-origin (do not suppress the embed referrer).
8. Run npm test in backend against its disposable MongoDB replica set, then perform the live-provider acceptance checks below. Deploy frontend and backend together.

## Acceptance checks
- Verify play/pause, ten-second skips, seeking, elapsed/duration, mute/volume, supported speeds, captions, keyboard navigation and fullscreen on desktop and mobile.
- Resume a saved lesson, switch with sidebar and Previous/Next, leave and return. Check pause/completion progress and rapid lesson switching.
- Revoke enrollment while playing and while paused; playback should stop within the access-check interval plus request timeout. Check blocked accounts and expired sessions too.
- Try private, deleted, embedding-disabled and missing videos, offline API loading and browser playback restrictions. Errors must be actionable and retry must create only one player.
- Verify admin mutations reject students, public course listings contain no video IDs, and unauthorized lesson/progress requests fail.

## Local validation
Run `npm test` in backend and `npm run lint` / `npm run build` in frountend. Tests use a disposable MongoDB replica set, never production data. `node tests/preview.js` provides disposable student/admin fixtures for browser testing. No deployments or live database migrations are performed by this change.
