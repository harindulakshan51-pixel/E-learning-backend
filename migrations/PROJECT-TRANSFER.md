# MongoDB and image storage transfer

The local backend uses the `E-learning-web` database on `cluster01.ppxvtza.mongodb.net`. The frontend and backend use `https://wlbbtprbqprjphegkdtq.supabase.co` and the public `Images` bucket. Credentials live in ignored `.env` files.

The previous backend configuration is retained locally in ignored `backend/.env.before-migration`. The source database is not modified. Keep this file private; it contains credentials.

`003-project-transfer.js` transfers users, courses, instructors, lessons, orders, enrollments and access codes while preserving MongoDB identifiers and nested order images. It creates exactly the three requested accounts when run against an empty destination. OTPs and rate-limit counters are transient and are not copied. Existing destination records are retained on reruns, but the three account passwords and session versions are reset on each apply.

To repeat the transfer, run from `backend` with `SOURCE_MONGODB_URI` (or the saved `.env.before-migration`) and `MONGODB_URI` configured. Supply `MIGRATION_ADMIN_PASSWORD` and `MIGRATION_STUDENT_PASSWORD` through the process environment, not source code:

```sh
node migrations/003-project-transfer.js
node migrations/003-project-transfer.js --apply
node migrations/001-access-control.js --apply
node migrations/002-youtube-lessons.js --apply
```

The access-control migration reconstructs missing enrollments from completed orders and keeps unverified legacy enrollments pending review. It does not grant access solely because an old enrollment exists.

All nine course images and the default profile image were verified in the destination bucket. Seven instructor portraits (`teachers/1.jpg` through `teachers/7.webp`, with the original extensions) are absent; the supplied default profile image is used for those instructors and the About page. Marketing course images and profile/course fallbacks also use the new bucket.

Remaining storage setup: set `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` to the new project's server-only service-role or secret key to enable admin image uploads. The supplied publishable key is recorded in the frontend environment, but does not authorize the backend uploader. Do not expose the backend key in `VITE_*` variables. Existing local branding assets (`logo.png` and `heroSection.png`) remain local because they are absent from the destination bucket and upload credentials have not been supplied.

Restart running frontend and backend processes after environment changes. Hosted deployments need the same environment values configured in their hosting settings and a new frontend build.

The API entry point now loads `backend/.env` by absolute module-relative path, overriding inherited environment values when this local file exists. Startup explicitly requires `cluster01.ppxvtza.mongodb.net/E-learning-web` and pins Mongoose to `E-learning-web`; an old cluster or database value stops startup instead of accepting writes. Nodemon restarts on code changes, but environment-only changes still require a restart. The subsequently registered `supder@gmail.com` account was also copied to the new database with its existing password hash.
