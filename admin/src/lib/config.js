// Build-time settings for the admin panel (see admin/.env.example).

/** The public website, for "View website" and "View on site" links. */
export const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL || 'http://localhost:3000').replace(/\/$/, '');
