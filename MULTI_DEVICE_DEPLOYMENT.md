# ITTP Multi-device deployment

## What this build does
- Keeps the existing business logic and navigation.
- Adds a polished responsive UI.
- Adds PWA install support for Android, iPhone and desktop browsers.
- Adds Vercel routing and exports the Express app for Vercel.

## Important database note
The current application stores its database in `data/db.json`. A Vercel serverless filesystem is not a persistent shared database. Therefore **do not deploy the JSON database to Vercel and assume it will safely store live sales**.

For real multi-device production use, the next deployment step must move the data layer to a persistent hosted database (for example PostgreSQL/Supabase/Neon) while keeping the existing routes and UI. Until that migration, the local Mac version remains the safe source of truth.

## GitHub -> Vercel
1. Push this folder to a GitHub repository.
2. In Vercel choose **Add New Project** and import that repository.
3. Framework preset: **Other**.
4. Build command: leave empty (or use `npm run vercel-build`).
5. Deploy.

The web app will be responsive and installable as a PWA. For shared live data across devices, connect the API to a persistent database before using it for real sales.
