import { getDemoLoginRole, isCreatableDemoRole } from "../_shared/demo-code.ts";

Deno.test("admin exposes the demo-code lifecycle contract", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const loginSource = await Deno.readTextFile(new URL("../demo-code-login/index.ts", import.meta.url));

  for (const action of ["demo-codes", "create-demo-code", "disable-demo-code", "reset-demo-code"]) {
    if (!source.includes(`action === "${action}"`)) {
      throw new Error(`missing admin action: ${action}`);
    }
  }

  if (!source.includes("codeHash") || !source.includes("generateDemoCode")) {
    throw new Error("admin creation must hash and generate demo codes");
  }
  if (!source.includes("code: rawCode")) {
    throw new Error("create must return the raw code in its one-time response");
  }
  if (source.includes("rawCode.replaceAll")) {
    throw new Error("the assigned email must not reveal or derive the raw code");
  }
  if (!loginSource.includes("isDemoUserForCode") || !loginSource.includes("email_conflict")) {
    throw new Error("demo login must not reuse an unrelated existing account");
  }
});

Deno.test("create-demo-code only accepts the user role", () => {
  if (!isCreatableDemoRole("user") || isCreatableDemoRole("admin") || isCreatableDemoRole("banned")) {
    throw new Error("demo codes must create ordinary users");
  }
});

Deno.test("demo-code login downgrades legacy admin rows", () => {
  if (getDemoLoginRole("admin") !== "user") {
    throw new Error("legacy admin-valued demo codes must grant user access");
  }
});
