# Miran Production Rules & Baseline

These rules are mandatory constraints for any future work on the Miran project.

## Core Rules

1. **Never modify `C:\Miran`**
   - The directory `C:\Miran` is strictly off-limits. Never read, edit, delete, or run commands targeting it.

2. **Work only in `C:\Miran-GitHub`**
   - All code, configurations, commands, and builds must be performed strictly within `C:\Miran-GitHub`.

3. **Production uses the new Supabase project**
   - Database infrastructure is hosted on the dedicated Supabase PostgreSQL project.
   - Migrations are managed via Prisma with direct connections to the Supabase pooler.

4. **Production backend is Render**
   - The backend service is hosted on Render (`miran-backend`, `https://miran-backend.onrender.com`).

5. **Frontend is Netlify miran33**
   - The frontend application is deployed to Netlify (`https://miran33.netlify.app`).

6. **Never expose secrets**
   - Passwords, API tokens, database connection URIs, JWT secrets, and other credentials must never be written into source code, committed to Git, or revealed in chat responses.

7. **Never use `npm audit fix --force`**
   - Do not run `npm audit fix --force` under any circumstances, as it introduces breaking changes to dependencies.

8. **Always verify build before push**
   - Always validate compilation locally (`npm run build` or `npm run verify:build`) and test Prisma client generation before committing or pushing changes to `origin main`.

9. **Never claim deployment success without a successful health check**
   - Deployment confirmation strictly requires `GET https://miran-backend.onrender.com/api/v1/health` returning `200 OK`.
