// LAX — admin pravi, mijenja i briše prijave radnica (Supabase Edge Function: lax-staff-user)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ko zove? mora biti admin
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: who, error: werr } = await caller.rpc("lax_whoami");
    if (werr || !who?.admin) return json({ error: "Samo admin može upravljati prijavama radnica." }, 403);

    const { action, staff_id, email, password } = await req.json();
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: st } = await db.from("lax_staff").select("*").eq("id", staff_id).maybeSingle();
    if (!st) return json({ error: "Radnica ne postoji." }, 404);

    const pwOk = (p: string) => typeof p === "string" && p.length >= 8;
    const isAdminUser = async (uid: string) =>
      !!(await db.from("lax_admins").select("user_id").eq("user_id", uid).maybeSingle()).data;

    if (action === "create") {
      const em = String(email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return json({ error: "Upiši ispravan email." }, 400);
      if (!pwOk(password)) return json({ error: "Lozinka mora imati bar 8 znakova." }, 400);
      if (st.user_id) return json({ error: "Radnica već ima prijavu." }, 400);
      const { data, error } = await db.auth.admin.createUser({
        email: em, password, email_confirm: true, user_metadata: { name: st.name, role: "radnica" },
      });
      if (error) {
        const exists = /already|registered|exists/i.test(error.message);
        return json({ error: exists ? "Nalog s tim emailom već postoji." : error.message, exists }, 400);
      }
      await db.from("lax_staff").update({ user_id: null }).eq("user_id", data.user.id);
      await db.from("lax_staff").update({ user_id: data.user.id, email: em }).eq("id", staff_id);
      return json({ ok: true });
    }

    if (action === "password") {
      if (!st.user_id) return json({ error: "Radnica nema prijavu." }, 400);
      if (!pwOk(password)) return json({ error: "Lozinka mora imati bar 8 znakova." }, 400);
      if (st.role !== "admin" && await isAdminUser(st.user_id)) return json({ error: "Ovo je vlasnički admin nalog — lozinku mijenja sam vlasnik." }, 400);
      const { error } = await db.auth.admin.updateUserById(st.user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "remove") {
      if (!st.user_id) return json({ ok: true });
      const uid = st.user_id;
      await db.from("lax_staff").update({ user_id: null, email: null }).eq("id", staff_id);
      if (!(await isAdminUser(uid))) {
        const { error } = await db.auth.admin.deleteUser(uid);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: "Nepoznata akcija." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
