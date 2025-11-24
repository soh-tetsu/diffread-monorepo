## Bootstrapping the Supabase schema

1. Make sure you have the Supabase CLI installed and logged in.
2. Copy the SQL in `db/init.sql` into `supabase/migrations/<timestamp>_init.sql` 
3. Push the schema to your linked project:
   ```bash
   supabase db push
   ```
4. Verify the tables and enums inside the Supabase dashboard before wiring the DAL helpers.

The SQL sets up the four core tables, enums for statuses/question types, indexes, and a trigger to keep `sessions.updated_at` fresh.
