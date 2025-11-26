-- Create the api schema for hardened Data API access
-- This schema will contain views and functions exposed to the Data API
-- while keeping the public schema protected

create schema if not exists api;

-- Grant usage to service_role (add other roles as needed)
grant usage on schema api to service_role;
