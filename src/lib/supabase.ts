import { createClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] || "https://cxurczhmrvxcuvklyiht.supabase.co";
const key =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  import.meta.env["VITE_SUPABASE_ANON_KEY"] ||
  "sb_publishable_LDyYi9pwVcFiI08WxuM0ug_I_krLj9i";
if (url.replace(/\/$/, "") !== "https://cxurczhmrvxcuvklyiht.supabase.co") {
  throw new Error("Projeto Supabase não autorizado para o Força de Vendas SulBR.");
}
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
