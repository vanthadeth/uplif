import type { NextConfig } from "next";
const config: NextConfig = { transpilePackages: ["@uplif/ui", "@uplif/supabase", "@uplif/auth"] };
export default config;
