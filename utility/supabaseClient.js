const { createClient } = require("@supabase/supabase-js");
const { supabaseKey, supabaseUrl } = require('../utility/constants');

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = {supabase};