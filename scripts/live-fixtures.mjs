// Deliberately opt-in: this creates actual users and records in a disposable project.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import sharp from "sharp";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expected = process.env.AQUARELAY_NONPRODUCTION_PROJECT_REF;
const origin = process.env.AQUARELAY_TEST_ORIGIN ?? "http://localhost:3000";
const manifestPath = new URL("../.env.fixtures.local", import.meta.url);

async function main() {
  if (
    !process.argv.includes("--allow-test-writes") ||
    !expected ||
    !url ||
    !key ||
    !serviceKey ||
    new URL(url).hostname !== `${expected}.supabase.co`
  ) {
    throw new Error(
      "Refusing writes: provide --allow-test-writes and AQUARELAY_NONPRODUCTION_PROJECT_REF matching the configured test project.",
    );
  }
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
    throw new Error(
      "Run this fixture tool against a local app connected to the confirmed test project.",
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const check = (result, operation) => {
    if (result.error)
      throw new Error(
        `${operation} failed (${result.error.code ?? result.error.status ?? "unknown"}).`,
      );
    return result.data;
  };
  // Verify the app is reachable before provisioning anything.
  const health = await fetch(`${origin}/api/me`);
  if (health.status !== 401)
    throw new Error(
      "Expected the local account API to reject an anonymous request with 401.",
    );
  let state;
  try {
    state = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  state ??= {
    project: expected,
    run: randomUUID(),
    accounts: {},
    incident: null,
    media: null,
  };
  if (state.project !== expected)
    throw new Error(
      "Fixture manifest belongs to a different project. Use a separate checkout for that project.",
    );
  const save = () =>
    writeFile(manifestPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  await save();
  for (const role of ["reporter", "verifier", "reviewer", "admin"]) {
    let account = state.accounts[role];
    if (!account) {
      account = {
        email: `aquarelay-${role}-${state.run}@example.test`,
        password: randomBytes(24).toString("base64url"),
      };
      state.accounts[role] = account;
      await save();
    }
    if (!account.id) {
      // Reuse a successfully created account after an interrupted manifest write.
      const probe = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signed = await probe.auth.signInWithPassword(account);
      const user =
        signed.data.user ??
        check(
          await admin.auth.admin.createUser({
            email: account.email,
            password: account.password,
            email_confirm: true,
            user_metadata: {
              display_name: `TEST ${role} ${state.run.slice(0, 8)}`,
            },
          }),
          `Create ${role}`,
        ).user;
      account.id = user.id;
      await save();
    }
    // Only the service client provisions test roles. Public signup cannot do this.
    check(
      await admin
        .from("profiles")
        .update({
          role: ["reviewer", "admin"].includes(role) ? role : "participant",
        })
        .eq("id", account.id),
      `Provision ${role}`,
    );
  }
  const cookies = new Map();
  const reporter = createServerClient(url, key, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) =>
        values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  check(
    await reporter.auth.signInWithPassword({
      email: state.accounts.reporter.email,
      password: state.accounts.reporter.password,
    }),
    "Sign in reporter",
  );
  async function post(path, body, idempotencyKey) {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: [...cookies].map(([n, v]) => `${n}=${v}`).join("; "),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `${path} failed (${response.status}, ${result.error?.code ?? "unknown"}).`,
      );
    return result;
  }
  if (!state.incident) {
    const now = new Date().toISOString();
    state.incident = await post(
      "/api/observations",
      {
        category: "foam",
        description: `TEST FIXTURE ${state.run}: simulated white foam viewed from a public bridge. This is not a real environmental report.`,
        locationLabel: "TEST DATA — fixture reach",
        observedAt: now,
        location: {
          latitude: 51.50023,
          longitude: -0.12027,
          source: "map",
          accuracyMeters: null,
          capturedAt: now,
        },
        answers: { conditionVisible: true, safeAccess: true },
        safetyFlags: [],
      },
      `fixture-${state.run}`,
    );
    await save();
  }
  const photo = await sharp(
    Buffer.from(
      '<svg width="800" height="500"><rect width="800" height="500" fill="#d8e7e0"/><text x="55" y="230" font-size="40">AquaRelay TEST FIXTURE</text><text x="55" y="290" font-size="25">Synthetic image — no real observation</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  if (!state.media) {
    state.media = await post("/api/uploads", {
      observationId: state.incident.observationId,
      fileName: "test-fixture.png",
      contentType: "image/png",
      byteSize: photo.length,
      sha256: createHash("sha256").update(photo).digest("hex"),
    });
    await save();
  }
  if (!state.media.uploaded) {
    const result = await fetch(state.media.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: photo,
    });
    if (!result.ok)
      throw new Error(`Fixture upload failed (${result.status}).`);
    state.media.uploaded = true;
    await save();
  }
  if (!state.media.completed) {
    await post(`/api/uploads/${state.media.mediaId}/complete`, {});
    state.media.completed = true;
    delete state.media.signedUrl;
    await save();
  }
  // Exercise the real reviewer workflow; no AI assessment is fabricated.
  if (!state.review) {
    check(await reporter.auth.signInWithPassword({
      email: state.accounts.reviewer.email, password: state.accounts.reviewer.password,
    }), "Sign in reviewer");
    state.review = await post(`/api/incidents/${state.incident.incidentId}/reviews`, {
      decision: "request_more_evidence",
      explanation: "TEST FIXTURE: request an independent upstream comparison and a later observation from safe public viewpoints.",
      requestedMissionTypes: ["upstream_comparison", "repeat_observation"],
    });
    await save();
  }
  console.log(
    "Fixture ready. Credentials and IDs are in the gitignored .env.fixtures.local file. Do not publish it.",
  );
  console.log(
    `Open ${origin}/investigations/${state.incident.incidentId}?mode=live`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
