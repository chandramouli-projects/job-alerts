// Resume upload and skills from the resume. TC-RES-xx
import { test, expect } from "@playwright/test";
import { deflateRawSync, crc32 } from "node:zlib";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn } from "./helpers.js";

const RESUME =
  "Chandra K - QA Engineer. 3 years of Manual Testing and Selenium WebDriver with Core Java. " +
  "Wrote REST API tests in Postman, ran them in Jenkins, tracked bugs in JIRA. Some SQL and Git.";

// A real (minimal) Word file: a zip with word/document.xml inside
function docx(text) {
  const files = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ],
    [
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
        .split(". ")
        .map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
        .join("")}</w:body></w:document>`,
    ],
  ];
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, body] of files) {
    const raw = Buffer.from(body),
      data = deflateRawSync(raw),
      n = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(raw), 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    local.push(h, n, data);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
// A real (minimal) PDF with one line of text
function pdf(text) {
  const stream = `BT /F1 10 Tf 40 760 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at = objs.map((o, i) => {
    const p = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return p;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map(p => String(p).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function start(
  page,
  request,
  prefs = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: ["selenium"] }
) {
  await useFixtures(page);
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, prefs));
  await openLoggedIn(page, a);
  await expect(page.locator("#shell")).toBeVisible();
  return a;
}
async function openProfile(page) {
  await page.locator("#side button", { hasText: "Profile" }).click();
  await expect(page.locator("#resumeCard")).toBeVisible();
}
async function upload(page, button, file) {
  const chooser = page.waitForEvent("filechooser");
  await page.click(button);
  await (await chooser).setFiles(file);
}
const chipTexts = page => page.locator("#sheet .rs-chip[data-rsk]").allTextContents();

test.describe("Resume", () => {
  test("TC-RES-01 a Word resume is saved, its skills are found, and the chosen ones are added", async ({
    page,
    request,
  }) => {
    const a = await start(page, request);
    await openProfile(page);
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "Chandra-Resume.docx",
      mimeType: DOCX_TYPE,
      buffer: docx(RESUME),
    });
    await expect(page.locator("#sheetTitle")).toHaveText("Skills from your resume");
    const found = await chipTexts(page);
    for (const s of ["java", "manual testing", "postman", "jenkins", "jira", "rest", "sql", "git"])
      expect(found).toContain(s);
    expect(found, "selenium is already in the profile").not.toContain("selenium");
    expect(found, "'Core Java' is java, not javascript").not.toContain("javascript");
    await expect(page.locator("#sheet .rs-chip.have")).toHaveText(["selenium"]);
    await page.click('#sheet [data-rsk="git"]'); // leave one out
    await expect(page.locator("#sheet [data-rsadd]")).toHaveText(`Add ${found.length - 1} skills`);
    await page.click("#sheet [data-rsadd]");
    await expect(page.locator("#toast")).toContainText(`Added ${found.length - 1} skills`);
    await expect(page.locator("#resumeCard .rs-name b")).toHaveText("Chandra-Resume.docx");
    // kept on the server: skills, file details and the file itself
    const me = async () =>
      (await (await request.get("/api/user", { headers: { Authorization: `Bearer ${a.token}` } })).json())
        .user;
    await expect
      .poll(async () => (await me()).prefs.skills)
      .toEqual(expect.arrayContaining(["selenium", "java", "postman"])); // the app saves after 0.5 s
    const user = await me();
    expect(user.prefs.skills).not.toContain("git");
    expect(user.profile.resumeFile).toMatchObject({ name: "Chandra-Resume.docx", type: DOCX_TYPE });
    const file = await request.get("/api/resume", { headers: { Authorization: `Bearer ${a.token}` } });
    expect(file.status()).toBe(200);
    expect(Buffer.compare(await file.body(), docx(RESUME))).toBe(0);
  });

  test("TC-RES-02 a PDF resume is read too", async ({ page, request }) => {
    await start(page, request);
    await openProfile(page);
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "cv.pdf",
      mimeType: "application/pdf",
      buffer: pdf("Python Django developer with AWS and Docker"),
    });
    await expect(page.locator("#sheetTitle")).toHaveText("Skills from your resume", { timeout: 15_000 });
    expect((await chipTexts(page)).sort()).toEqual(["aws", "django", "docker", "python"]);
  });

  test("TC-RES-03 wrong files are refused with a clear reason", async ({ page, request }) => {
    await start(page, request);
    await openProfile(page);
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "old.doc",
      mimeType: "application/msword",
      buffer: Buffer.from("x"),
    });
    await expect(page.locator("#resumeErr")).toContainText("Old Word (.doc) files can't be read");
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("x"),
    });
    await expect(page.locator("#resumeErr")).toHaveText("Upload a PDF or Word (.docx) file.");
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "big.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(2.5 * 1024 * 1024, 32),
    });
    await expect(page.locator("#resumeErr")).toContainText("The limit is 2 MB");
    await expect(page.locator("#resumeCard .rs-drop")).toBeVisible(); // nothing was saved
  });

  test("TC-RES-04 a resume with no text is still saved, and says why no skills were found", async ({
    page,
    request,
  }) => {
    await start(page, request);
    await openProfile(page);
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "scan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("   "),
    });
    await expect(page.locator("#sheet .rs-note")).toContainText("scanned picture");
    await page.click("#sheet [data-rsskip]");
    await expect(page.locator("#resumeCard .rs-name b")).toHaveText("scan.txt");
  });

  test("TC-RES-05 while setting up, 'Fill from my resume' adds the skills to the skills question", async ({
    page,
    request,
  }) => {
    await useFixtures(page);
    const a = await signupApi(request);
    await openLoggedIn(page, a);
    await expect(page.locator("#ob")).toBeVisible();
    await upload(page, "#obResume [data-rsupload]", {
      name: "me.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(RESUME),
    });
    await expect(page.locator("#sheetTitle")).toHaveText("Skills from your resume");
    await page.click("#sheet [data-rsadd]");
    const chips = (await page.locator('.pk[data-pk="skill"] .pk-chip').allTextContents()).map(c =>
      c.replace("×", "").trim()
    );
    expect(chips).toEqual(expect.arrayContaining(["selenium", "java", "jira"]));
    await expect(page.locator("#obResume")).toContainText("me.txt uploaded");
  });

  test("TC-RES-06 remove deletes the file; the added skills stay", async ({ page, request }) => {
    const a = await start(page, request);
    await openProfile(page);
    await upload(page, "#resumeCard [data-rsupload]", {
      name: "r.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(RESUME),
    });
    await page.click("#sheet [data-rsadd]");
    await page.click("#resumeCard [data-rsremove]");
    await page.click("#askYes");
    await expect(page.locator("#resumeCard .rs-drop")).toBeVisible();
    expect(
      (await request.get("/api/resume", { headers: { Authorization: `Bearer ${a.token}` } })).status()
    ).toBe(404);
    await expect(page.locator("#main .kv")).toContainText("jira");
  });

  test("TC-RES-07 a resume can only be downloaded by its owner", async ({ request }) => {
    const a = await signupApi(request),
      b = await signupApi(request);
    const put = await request.put("/api/resume", {
      headers: { Authorization: `Bearer ${a.token}` },
      data: { name: "a.pdf", data: pdf("Java").toString("base64") },
    });
    expect(put.status()).toBe(200);
    expect((await request.get("/api/resume")).status()).toBe(401);
    expect(
      (await request.get("/api/resume", { headers: { Authorization: `Bearer ${b.token}` } })).status()
    ).toBe(404);
    expect(
      (
        await request.put("/api/resume", {
          headers: { Authorization: `Bearer ${a.token}` },
          data: { name: "x.exe", data: "AAAA" },
        })
      ).status()
    ).toBe(400);
    // deleting the account deletes the resume
    await request.delete("/api/user", {
      headers: { Authorization: `Bearer ${a.token}` },
      data: { password: "Test@1234" },
    });
    const again = await signupApi(request, a.email);
    expect(
      (await request.get("/api/resume", { headers: { Authorization: `Bearer ${again.token}` } })).status()
    ).toBe(404);
  });
  test("TC-RES-08 without the accounts server (the public site), the resume is kept in this browser", async ({
    page,
  }) => {
    await useFixtures(page);
    await page.route("**/api/**", r =>
      r.fulfill({ body: "<!doctype html><title>home</title>", contentType: "text/html" })
    ); // like Cloudflare Pages
    await page.goto("/"); // with no accounts in this browser, the sign-up form opens first
    await page.fill("#sName", "Local User");
    await page.fill("#sEmail", "local-" + Date.now() + "@example.com");
    await page.fill("#sPass", "Test@1234");
    await page.click("#signupForm button[type=submit]");
    await expect(page.locator("#ob")).toBeVisible();
    await upload(page, "#obResume [data-rsupload]", {
      name: "cv.docx",
      mimeType: DOCX_TYPE,
      buffer: docx(RESUME),
    });
    await page.click("#sheet [data-rsadd]");
    await page.locator('.pk[data-pk="role"] [data-pkopen]').click();
    await page.click('.pk-opt[data-pkval="role"][data-v="QA / Testing"]');
    await page.locator('.pk[data-pk="exp"] [data-pkopen]').click();
    await page.click('.pk-opt[data-pkval="exp"][data-v="3"]');
    await page.evaluate(() => {
      draft.cities = ["Hyderabad"];
      obValidate();
    });
    await page.click("#obNext");
    await openProfile(page);
    await expect(page.locator("#resumeCard .rs-name small")).toContainText("Kept in this browser");
    const download = page.waitForEvent("download");
    await page.click("#resumeCard [data-rsview]");
    expect((await download).suggestedFilename()).toBe("cv.docx");
  });
});
