const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Supabase credentials missing in signaling-server. Please check your .env file.');
}

// Create a single supabase client for interacting with your database
const supabase = createClient(
  supabaseUrl || '',
  supabaseServiceRoleKey || ''
);

module.exports = { supabase };
